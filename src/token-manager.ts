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

import { SecurityBinding } from './security-binding.js';
import {
  AuthorizationRequiredError, TokenConfiguration, TokenProvider, TokenProviderError,
  TokenRequest, TokenSet, TokenStore,
} from './token-provider.js';

/** A credential receipt used for conditional invalidation after an invalid-token response. */
export interface TokenLease {
  readonly key: string;
  readonly tokens: TokenSet;
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
 * running; canceling the last waiter signals the provider. A failed renewal is never cached.
 */
export class TokenManager {
  private readonly providers: ReadonlyMap<string, TokenProvider>;
  private readonly store: TokenStore;
  private readonly renewals = new Map<string, Renewal>();
  private readonly authorizationAttempts = new Set<string>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly now: () => number;
  private readonly skew: number;

  constructor(
    providers: Readonly<Record<string, TokenProvider>>,
    options: { store?: TokenStore; expirySkewMs?: number; now?: () => number } = {},
  ) {
    this.providers = new Map(Object.entries(providers));
    this.store = options.store ?? new MemoryTokenStore();
    this.now = options.now ?? Date.now;
    this.skew = options.expirySkewMs ?? 30_000;
    if (!Number.isFinite(this.skew) || this.skew < 0) throw new RangeError('Invalid token expiry skew');
  }

  /** Acquires current credentials without invoking authorization twice for an expired interactive session. */
  async credentials(binding: SecurityBinding, signal?: AbortSignal): Promise<TokenLease> {
    signal?.throwIfAborted();
    const provider = this.providers.get(binding.provider);
    if (!provider) throw new TokenProviderError();
    let configuration: TokenConfiguration;
    try {
      configuration = provider.configure(binding);
    }
    catch {
      throw new TokenProviderError();
    }
    if (!provider.identity.trim() || !configuration.clientIdentity.trim() ||
      (binding.flow === 'authorizationCode' && !configuration.grantIdentity?.trim())) throw new TokenProviderError();
    const request: TokenRequest = Object.freeze({
      ...binding,
      discoveryUrl: configuration.endpoints?.discoveryUrl ?? binding.discoveryUrl,
      authorizationUrl: configuration.endpoints?.authorizationUrl ?? binding.authorizationUrl,
      tokenUrl: configuration.endpoints?.tokenUrl ?? binding.tokenUrl,
      refreshUrl: configuration.endpoints?.refreshUrl ?? binding.refreshUrl,
      clientIdentity: configuration.clientIdentity,
      grantIdentity: configuration.grantIdentity,
      scopes: Object.freeze([...new Set(binding.scopes)].sort()),
      transport: Object.freeze({ ...binding.transport }),
    });
    const key = JSON.stringify([
      binding.provider, provider.identity, request.clientIdentity, request.grantIdentity,
      request.profile, request.flow, request.discoveryUrl, request.authorizationUrl, request.tokenUrl,
      request.refreshUrl, request.scopes, request.audience, request.resource,
    ]);
    let renewal = this.renewals.get(key);
    if (!renewal || renewal.controller.signal.aborted) {
      const controller = new AbortController();
      const created: Renewal = {
        controller, waiters: 0, settled: false, committing: false,
        promise: this.exclusive(key, () => this.renew(key, provider, request, controller.signal)),
      };
      this.renewals.set(key, created);
      void created.promise.finally(() => {
        created.settled = true;
        if (this.renewals.get(key) === created) this.renewals.delete(key);
      }).catch(() => undefined);
      renewal = created;
    }
    return this.join(renewal, signal);
  }

  /** Invalidates only the credential that failed, preserving a token already renewed by another caller. */
  async invalidate(lease: TokenLease): Promise<void> {
    try {
      await this.exclusive(lease.key, async () => {
        const current = await this.store.load(lease.key);
        if (current?.accessToken === lease.tokens.accessToken) {
          await this.store.save(lease.key, Object.freeze({ ...current, expiresAt: 0 }));
        }
      });
    }
    catch {
      throw new TokenProviderError();
    }
  }

  private exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(action);
    this.locks.set(key, next);
    void next.finally(() => {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }).catch(() => undefined);
    return next;
  }

  private async renew(key: string, provider: TokenProvider, request: TokenRequest, signal: AbortSignal): Promise<TokenLease> {
    try {
      signal.throwIfAborted();
      const stored = await this.store.load(key);
      signal.throwIfAborted();
      if (stored && (stored.expiresAt === undefined || stored.expiresAt > this.now() + this.skew)) {
        return { key, tokens: Object.freeze({ ...stored }) };
      }
      let tokens: TokenSet;
      if (stored?.refreshToken && provider.refresh) {
        const refreshed = await provider.refresh(request, stored.refreshToken, signal);
        tokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? stored.refreshToken };
      }
      else if (request.flow === 'authorizationCode' && (stored || this.authorizationAttempts.has(key))) {
        throw new AuthorizationRequiredError();
      }
      else {
        if (request.flow === 'authorizationCode') this.authorizationAttempts.add(key);
        tokens = await provider.acquire(request, signal);
      }
      if (!tokens.accessToken || (tokens.expiresAt !== undefined &&
        (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= this.now()))) throw new TokenProviderError();
      const snapshot = Object.freeze({ ...tokens });
      // A completed refresh may rotate the token even if callers canceled while the provider completed.
      const renewal = this.renewals.get(key);
      if (renewal?.controller.signal === signal) renewal.committing = true;
      await this.store.save(key, snapshot);
      return { key, tokens: snapshot };
    }
    catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof AuthorizationRequiredError) throw error;
      throw new TokenProviderError();
    }
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
        if (renewal.waiters === 0 && !renewal.settled && !renewal.committing) renewal.controller.abort();
        if (value) resolve(value); else reject(error);
      };
      const abort = () => finish(undefined, signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      renewal.promise.then(value => finish(value), error => finish(undefined, error));
    });
  }
}

class MemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, TokenSet>();
  async load(key: string): Promise<TokenSet | undefined> { return this.tokens.get(key); }
  async save(key: string, tokens: TokenSet): Promise<void> { this.tokens.set(key, tokens); }
  async remove(key: string): Promise<void> { this.tokens.delete(key); }
}
