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

import { SecurityBinding, SecurityEndpoints } from './security-binding.js';

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
 * the shared manager owns caching, rotation, renewal coalescing, and cancellation.
 */
export interface TokenProvider {
  readonly identity: string;
  configure(binding: SecurityBinding): TokenConfiguration;
  acquire(request: TokenRequest, signal: AbortSignal): Promise<TokenSet>;
  refresh?(request: TokenRequest, refreshToken: string, signal: AbortSignal): Promise<TokenSet>;
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
  constructor() {
    super('The credential provider could not supply usable credentials');
    this.name = 'TokenProviderError';
  }
}
