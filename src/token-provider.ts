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

import { isRequestStopped } from './request-cancellation-error.js';
import { SecurityBinding, SecurityEndpoints } from './security-binding.js';
import type { TokenLease } from './token-manager.js';

/** Credentials returned by an application provider; values are never included in runtime diagnostics. */
export interface TokenSet {
  readonly accessToken: string;
  readonly expiresAt?: number;
  readonly refreshToken?: string;
}

/** Non-secret identities isolate cache entries; grantIdentity must change with session or grant inputs. */
export interface TokenConfiguration {
  readonly clientIdentity: string;
  readonly grantIdentity?: string;
  readonly endpoints?: SecurityEndpoints;
}

/** Fully selected acquisition parameters; this contains neither client secrets nor authorization codes. */
export interface TokenRequest extends SecurityBinding {
  readonly clientIdentity: string;
  readonly grantIdentity?: string;
}

/**
 * Application credential binding. OAuth providers exchange fresh authorization and refresh tokens;
 * providers own their lifecycle; TokenManager adds caching only when explicitly supplied.
 */
export interface TokenProvider {
  readonly identity: string;
  configure(binding: SecurityBinding): TokenConfiguration;
  acquire(request: TokenRequest, signal: AbortSignal): Promise<TokenSet>;
  /** Optional receipt acquisition, used by caching decorators to retain their original cache identity. */
  credentials?(
    binding: SecurityBinding,
    signal?: AbortSignal,
  ): Promise<TokenLease>;
  /** Rejects only this token in its original session. False leaves recovery to the caller. */
  reject?(request: TokenRequest, rejectedToken: string): Promise<boolean>;
  refresh?(
    request: TokenRequest,
    refreshToken: string,
    signal: AbortSignal,
  ): Promise<TokenSet>;
}

/** Application-owned storage. Implementations must serialize writes and keep credentials private. */
export interface TokenStore {
  load(key: string): Promise<TokenSet | undefined>;
  save(key: string, tokens: TokenSet): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Signals that an interactive application must supply a fresh authorization session. */
export class AuthorizationRequiredError extends Error {
  constructor() {
    super('Fresh application authorization is required');
    this.name = 'AuthorizationRequiredError';
  }
}

/** Safe provider failure without a provider's potentially credential-bearing error message. */
export class TokenProviderError extends Error {
  /** Safe recovery classification; provider messages and credentials are never retained. */
  constructor(
    readonly reason:
      | 'unavailable'
      | 'temporary'
      | 'invalidGrant' = 'unavailable',
  ) {
    super('The credential provider could not supply usable credentials');
    this.name = 'TokenProviderError';
  }
}

/** Acquires once from an application provider without adding storage or refresh policy. */
export async function providerCredentials(
  provider: TokenProvider,
  binding: SecurityBinding,
  signal: AbortSignal,
): Promise<TokenLease> {
  signal.throwIfAborted();
  try {
    if (provider.credentials) {
      const lease = await provider.credentials(binding, signal);
      signal.throwIfAborted();
      return {
        ...lease,
        invalidate: lease.invalidate
          ? async () => {
              try {
                return await lease.invalidate!();
              } catch (error) {
                throw safeProviderError(error);
              }
            }
          : undefined,
      };
    }
    const configuration = provider.configure(binding);
    if (!provider.identity.trim() || !configuration.clientIdentity.trim())
      throw new TokenProviderError();
    const request: TokenRequest = Object.freeze({
      ...binding,
      ...Object.fromEntries(
        Object.entries(configuration.endpoints ?? {}).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      clientIdentity: configuration.clientIdentity,
      grantIdentity: configuration.grantIdentity,
      scopes: Object.freeze(
        [...new Set(binding.scopes)].sort((left, right) => {
          // Credential scope order must not depend on the host locale.
          if (left === right) return 0;
          return left < right ? -1 : 1;
        }),
      ),
      transport: Object.freeze({ ...binding.transport }),
    });
    const tokens = Object.freeze({
      ...(await provider.acquire(request, signal)),
    });
    signal.throwIfAborted();
    if (
      !tokens.accessToken ||
      (tokens.expiresAt !== undefined &&
        (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= Date.now()))
    )
      throw new TokenProviderError();
    return {
      key: '',
      tokens,
      invalidate: async () => {
        try {
          return (
            (await provider.reject?.(request, tokens.accessToken)) ?? false
          );
        } catch (error) {
          throw safeProviderError(error);
        }
      },
    };
  } catch (error) {
    signal.throwIfAborted();
    throw safeProviderError(error);
  }
}

function safeProviderError(error: unknown): unknown {
  return isRequestStopped(error) ||
    error instanceof AuthorizationRequiredError ||
    error instanceof TokenProviderError
    ? error
    : new TokenProviderError();
}
