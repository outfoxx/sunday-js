// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { withAbort } from './util/abort.js';
import { isRequestStopped } from './request-cancellation-error.js';
import { SecurityBinding } from './security-binding.js';
import {
  AuthorizationRequiredError,
  TokenConfiguration,
  TokenProvider,
  TokenProviderError,
  TokenRequest,
  TokenSet,
  TokenStore,
} from './token-provider.js';

/** A credential receipt used for conditional invalidation after an invalid-token response. */
export interface TokenLease {
  readonly key: string;
  readonly tokens: TokenSet;
  /** Rejects the original credential without invalidating a concurrent replacement. */
  readonly invalidate?: () => Promise<boolean>;
}

interface Renewal {
  readonly controller: AbortController;
  readonly promise: Promise<TokenLease>;
  waiters: number;
  settled: boolean;
  committing: boolean;
}

/**
 * Shared token lifecycle with one renewal per cache key. Canceling one caller leaves other waiters
 * running; canceling the last waiter stops waiting for the provider without abandoning storage commits.
 * A failed or cancelled acquisition is never cached.
 */
export class TokenManager implements TokenProvider {
  readonly identity: string;
  private readonly provider?: TokenProvider;
  private readonly providers: ReadonlyMap<string, TokenProvider>;
  private readonly store: TokenStore;
  private readonly renewals = new Map<string, Renewal>();
  private readonly authorizationAttempts = new Set<string>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly now: () => number;
  private readonly skew: number;

  constructor(
    providers: TokenProvider | Readonly<Record<string, TokenProvider>>,
    options: {
      store?: TokenStore;
      expirySkewMs?: number;
      now?: () => number;
    } = {},
  ) {
    this.provider =
      typeof providers.acquire === 'function'
        ? (providers as TokenProvider)
        : undefined;
    this.providers = new Map(
      this.provider
        ? []
        : Object.entries(providers as Readonly<Record<string, TokenProvider>>),
    );
    this.identity = this.provider?.identity ?? crypto.randomUUID();
    this.store = options.store ?? new MemoryTokenStore();
    this.now = options.now ?? Date.now;
    this.skew = options.expirySkewMs ?? 30_000;
    if (!Number.isFinite(this.skew) || this.skew < 0)
      throw new RangeError('Invalid token expiry skew');
  }

  /** Forwards application configuration to the explicitly managed provider. */
  configure(binding: SecurityBinding): TokenConfiguration {
    const provider = this.provider ?? this.providers.get(binding.provider);
    if (!provider) throw new TokenProviderError();
    return provider.configure(binding);
  }

  /** Obtains managed credentials; receipt acquisition preserves rejection context. */
  async acquire(request: TokenRequest, signal: AbortSignal): Promise<TokenSet> {
    return (await this.credentials(request, signal)).tokens;
  }

  /** Acquires current credentials without invoking authorization twice for an expired interactive session. */
  async credentials(
    binding: SecurityBinding,
    signal?: AbortSignal,
  ): Promise<TokenLease> {
    signal?.throwIfAborted();
    const provider = this.provider ?? this.providers.get(binding.provider);
    if (!provider) throw new TokenProviderError();
    let configuration: TokenConfiguration;
    try {
      configuration = provider.configure(binding);
    } catch (error) {
      if (isRequestStopped(error)) throw error;
      throw new TokenProviderError();
    }
    if (
      !provider.identity.trim() ||
      !configuration.clientIdentity.trim() ||
      (binding.flow === 'authorizationCode' &&
        !configuration.grantIdentity?.trim())
    )
      throw new TokenProviderError();
    const request: TokenRequest = Object.freeze({
      ...binding,
      discoveryUrl:
        configuration.endpoints?.discoveryUrl ?? binding.discoveryUrl,
      authorizationUrl:
        configuration.endpoints?.authorizationUrl ?? binding.authorizationUrl,
      tokenUrl: configuration.endpoints?.tokenUrl ?? binding.tokenUrl,
      refreshUrl: configuration.endpoints?.refreshUrl ?? binding.refreshUrl,
      clientIdentity: configuration.clientIdentity,
      grantIdentity: configuration.grantIdentity,
      scopes: Object.freeze([...new Set(binding.scopes)].sort(compareScopes)),
      transport: Object.freeze({ ...binding.transport }),
    });
    const key = JSON.stringify([
      request.scheme,
      binding.provider,
      provider.identity,
      request.clientIdentity,
      request.grantIdentity,
      request.profile,
      request.flow,
      request.discoveryUrl,
      request.authorizationUrl,
      request.tokenUrl,
      request.refreshUrl,
      request.scopes,
      request.audience,
      request.resource,
    ]);
    let renewal = this.renewals.get(key);
    if (!renewal || renewal.controller.signal.aborted) {
      const controller = new AbortController();
      const created: Renewal = {
        controller,
        waiters: 0,
        settled: false,
        committing: false,
        promise: this.exclusive(key, () =>
          this.renew(key, provider, request, controller.signal),
        ),
      };
      this.renewals.set(key, created);
      void created.promise
        .finally(() => {
          created.settled = true;
          if (this.renewals.get(key) === created) this.renewals.delete(key);
        })
        .catch(() => undefined);
      renewal = created;
    }
    const lease = await this.join(renewal, signal);
    return {
      ...lease,
      invalidate: async () => {
        await this.invalidate(lease);
        return true;
      },
    };
  }

  /** Invalidates only the credential that failed, preserving a token already renewed by another caller. */
  async invalidate(lease: TokenLease): Promise<void> {
    try {
      await this.exclusive(lease.key, async () => {
        const current = await this.store.load(lease.key);
        if (current?.accessToken === lease.tokens.accessToken) {
          await this.store.save(
            lease.key,
            Object.freeze({ ...current, expiresAt: 0 }),
          );
        }
      });
    } catch (error) {
      if (isRequestStopped(error)) throw error;
      throw new TokenProviderError();
    }
  }

  private exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(action);
    this.locks.set(key, next);
    void next
      .finally(() => {
        if (this.locks.get(key) === next) this.locks.delete(key);
      })
      .catch(() => undefined);
    return next;
  }

  private async renew(
    key: string,
    provider: TokenProvider,
    request: TokenRequest,
    signal: AbortSignal,
  ): Promise<TokenLease> {
    try {
      signal.throwIfAborted();
      const stored = await this.store.load(key);
      signal.throwIfAborted();
      if (
        stored &&
        (stored.expiresAt === undefined ||
          stored.expiresAt > this.now() + this.skew)
      ) {
        return { key, tokens: Object.freeze({ ...stored }) };
      }
      const tokens = await this.acquireOrRefresh(
        key,
        stored,
        provider,
        request,
        signal,
      );
      if (
        !tokens.accessToken ||
        (tokens.expiresAt !== undefined &&
          (!Number.isFinite(tokens.expiresAt) ||
            tokens.expiresAt <= this.now()))
      )
        throw new TokenProviderError();
      const snapshot = Object.freeze({ ...tokens });
      signal.throwIfAborted();
      const renewal = this.renewals.get(key);
      if (renewal?.controller.signal !== signal)
        throw new DOMException('Renewal expired', 'AbortError');
      // Once persistence begins, cancellation must not discard a rotated refresh token.
      renewal.committing = true;
      await this.store.save(key, snapshot);
      return { key, tokens: snapshot };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (isRequestStopped(error)) throw error;
      if (
        error instanceof AuthorizationRequiredError ||
        error instanceof TokenProviderError
      )
        throw error;
      throw new TokenProviderError();
    }
  }

  private async acquireOrRefresh(
    key: string,
    stored: TokenSet | undefined,
    provider: TokenProvider,
    request: TokenRequest,
    signal: AbortSignal,
  ): Promise<TokenSet> {
    const refreshToken = stored?.refreshToken;
    if (refreshToken && provider.refresh) {
      try {
        const refreshed = await withAbort(
          () => provider.refresh!(request, refreshToken, signal),
          signal,
        );
        return {
          ...refreshed,
          refreshToken: refreshed.refreshToken ?? refreshToken,
        };
      } catch (error) {
        if (
          !(error instanceof TokenProviderError) ||
          error.reason !== 'invalidGrant' ||
          request.flow !== 'clientCredentials'
        )
          throw error;
        signal.throwIfAborted();
        await this.store.remove(key);
      }
    } else if (
      request.flow === 'authorizationCode' &&
      (stored || this.authorizationAttempts.has(key))
    ) {
      throw new AuthorizationRequiredError();
    }
    // Only provider work is cancellable: storage mutations must finish before releasing the
    // key's lock. Late provider completion is observed by withAbort but cannot reach persistence.
    return withAbort(() => {
      if (request.flow === 'authorizationCode')
        this.authorizationAttempts.add(key);
      return provider.acquire(request, signal);
    }, signal);
  }

  private join(renewal: Renewal, signal?: AbortSignal): Promise<TokenLease> {
    renewal.waiters++;
    return new Promise((resolve, reject) => {
      let completed = false;
      const finish = (value?: TokenLease, error?: unknown) => {
        if (completed) return;
        completed = true;
        signal?.removeEventListener('abort', abort);
        renewal.waiters--;
        if (renewal.waiters === 0 && !renewal.settled && !renewal.committing)
          renewal.controller.abort(error);
        if (value) resolve(value);
        else reject(error);
      };
      const abort = () => finish(undefined, signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      renewal.promise.then(
        (value) => finish(value),
        (error) => finish(undefined, error),
      );
    });
  }
}

class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, TokenSet>();
  load(key: string): Promise<TokenSet | undefined> {
    return Promise.resolve(this.tokens.get(key));
  }
  save(key: string, tokens: TokenSet): Promise<void> {
    this.tokens.set(key, tokens);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.tokens.delete(key);
    return Promise.resolve();
  }
}

function compareScopes(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
