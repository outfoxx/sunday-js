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

import * as oauth from 'oauth4webapi';

import { SecurityBinding, SecurityEndpoints } from './security-binding.js';
import {
  AuthorizationRequiredError, TokenConfiguration, TokenProvider, TokenProviderError,
  TokenRequest, TokenSet,
} from './token-provider.js';

import { DiscoveryMetadata, TokenSuccessResponse, TokenErrorResponse, endpoint } from './oauth-wire.js';

/** Fresh application-authorized S256 PKCE grant, consumed once even if exchange fails or is canceled. */
export interface AuthorizationGrant {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

/** Application-owned OAuth configuration; secrets and session grants never appear in generated metadata. */
export interface OAuthProviderOptions {
  readonly identity: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly authentication?: 'none' | 'client_secret_basic' | 'client_secret_post';
  readonly grantIdentity?: string;
  /** The application verifies state, issuer, and redirect URI before supplying an authorization result. */
  readonly authorization?: (request: TokenRequest, signal: AbortSignal) => Promise<AuthorizationGrant>;
  readonly endpoints?: SecurityEndpoints;
  /** Expected discovery issuer; endpoint overrides never change this separate trust value. */
  readonly issuer?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/** Client-credentials, application-authorized PKCE, and refresh exchange without cookies or automatic redirects. */
export class FetchOAuthTokenProvider implements TokenProvider {
  readonly identity: string;
  private readonly options: OAuthProviderOptions;
  private readonly authentication: NonNullable<OAuthProviderOptions['authentication']>;
  private readonly consumedCodes = new Set<string>();
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(options: OAuthProviderOptions) {
    this.authentication = options.authentication ?? 'none';
    if (!['none', 'client_secret_basic', 'client_secret_post'].includes(this.authentication)) throw new TypeError('Unsupported OAuth client authentication; use an application TokenProvider');
    if (!options.identity.trim() || !options.clientId.trim()) throw new TypeError('OAuth provider and client identities must not be blank');
    if ((this.authentication === 'none') !== (options.clientSecret === undefined) || options.clientSecret === '') {
      throw new TypeError('Client secrets require an explicit OAuth client authentication method');
    }
    this.identity = options.identity;
    this.options = Object.freeze({ ...options, endpoints: options.endpoints && Object.freeze({ ...options.endpoints }) });
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  /** Selects the application client and fresh session without changing the generated profile. */
  configure(_binding: SecurityBinding): TokenConfiguration {
    return { clientIdentity: this.options.clientId, grantIdentity: this.options.grantIdentity, endpoints: this.options.endpoints };
  }

  /** Acquires a client token or exchanges one application-authorized PKCE grant. */
  async acquire(request: TokenRequest, signal: AbortSignal): Promise<TokenSet> {
    try {
      request = await this.resolveEndpoints(request, signal);
      let form: URLSearchParams;
      if (request.flow === 'clientCredentials') {
        if (this.authentication === 'none') throw new TokenProviderError();
        form = new URLSearchParams({ grant_type: 'client_credentials' });
      }
      else if (request.flow === 'authorizationCode') {
        if (!this.options.authorization || this.consumedCodes.size >= 1024) throw new AuthorizationRequiredError();
        const grant = await this.options.authorization(request, signal);
        if (!grant.code || !grant.redirectUri || !/^[A-Za-z0-9._~-]{43,128}$/.test(grant.codeVerifier)) throw new AuthorizationRequiredError();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(grant.code)));
        const codeKey = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        if (this.consumedCodes.size >= 1024 || this.consumedCodes.has(codeKey)) throw new AuthorizationRequiredError();
        this.consumedCodes.add(codeKey);
        form = new URLSearchParams({ grant_type: 'authorization_code', code: grant.code, redirect_uri: grant.redirectUri, code_verifier: grant.codeVerifier });
      }
      else throw new TokenProviderError();
      return await this.exchange(request, request.tokenUrl, form, signal);
    }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof AuthorizationRequiredError || error instanceof TokenProviderError) throw error;
      throw new TokenProviderError();
    }
  }

  /** Rotates refresh credentials without using an authorization code again. */
  async refresh(request: TokenRequest, refreshToken: string, signal: AbortSignal): Promise<TokenSet> {
    try {
      request = await this.resolveEndpoints(request, signal);
      return await this.exchange(request, request.refreshUrl ?? request.tokenUrl,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }), signal);
    }
    catch (error) {
      signal.throwIfAborted();
      if (error instanceof AuthorizationRequiredError || error instanceof TokenProviderError) throw error;
      throw new TokenProviderError();
    }
  }

  private async resolveEndpoints(request: TokenRequest, signal: AbortSignal): Promise<TokenRequest> {
    if (!request.discoveryUrl) return request;
    if (!this.options.issuer) throw new TokenProviderError();
    const response = await this.fetchResponse(endpoint(request.discoveryUrl), {
      headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'manual', signal,
    });
    if (response.status !== 200) throw new TokenProviderError();
    const metadata = DiscoveryMetadata.parse(await response.text());
    if (metadata.issuer !== this.options.issuer) throw new TokenProviderError();
    const publicCode = this.authentication === 'none' && request.flow === 'authorizationCode';
    if (!publicCode && !(metadata.methods ?? ['client_secret_basic']).includes(this.authentication)) throw new TokenProviderError();
    const tokenUrl = request.tokenUrl ?? metadata.tokenUrl;
    const authorizationUrl = request.authorizationUrl ?? metadata.authorizationUrl;
    endpoint(tokenUrl);
    if (authorizationUrl !== undefined) endpoint(authorizationUrl);
    else if (request.flow === 'authorizationCode') throw new TokenProviderError();
    if (request.refreshUrl !== undefined) endpoint(request.refreshUrl);
    return { ...request, tokenUrl, authorizationUrl };
  }

  private async fetchResponse(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try { response = await this.fetch(url, init); }
    catch {
      init.signal?.throwIfAborted();
      throw new TokenProviderError('temporary');
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500 && response.status <= 599) {
      await response.body?.cancel();
      throw new TokenProviderError('temporary');
    }
    return response;
  }

  private async exchange(request: TokenRequest, tokenUrl: string | undefined, form: URLSearchParams, signal: AbortSignal): Promise<TokenSet> {
    if (request.scopes.length) form.set('scope', request.scopes.join(' '));
    if (request.audience !== undefined) form.set('audience', request.audience);
    if (request.resource !== undefined) form.set('resource', request.resource);
    const url = endpoint(tokenUrl);
    const authentication = this.authentication === 'client_secret_basic'
      ? oauth.ClientSecretBasic(this.options.clientSecret!)
      : this.authentication === 'client_secret_post'
        ? oauth.ClientSecretPost(this.options.clientSecret!) : oauth.None();
    const grantType = form.get('grant_type')!;
    form.delete('grant_type');
    const response = await oauth.genericTokenEndpointRequest(
      { issuer: new URL(url).origin, token_endpoint: url },
      { client_id: this.options.clientId }, authentication, grantType, form, {
        signal,
        // Endpoint policy permits HTTP only for loopback, before this escape hatch is enabled.
        [oauth.allowInsecureRequests]: new URL(url).protocol === 'http:',
        [oauth.customFetch]: (input, init) => this.fetchResponse(String(input), {
          ...init, credentials: 'omit', redirect: 'manual', signal,
        }),
      });
    const body = await response.text();
    if (response.status !== 200) {
      const code = TokenErrorResponse.parse(body).code;
      if (code === 'invalid_grant') {
        if (request.flow === 'authorizationCode') throw new AuthorizationRequiredError();
        throw new TokenProviderError('invalidGrant');
      }
      if (code === 'temporarily_unavailable' || code === 'server_error') throw new TokenProviderError('temporary');
      throw new TokenProviderError();
    }
    return (await TokenSuccessResponse.parse(body)).tokens(request.scopes, this.now());
  }
}
