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

import { TokenProviderError, TokenSet } from './token-provider.js';

/** Internal wire decoding; client/session policy remains in the provider. */
export class DiscoveryMetadata {
  private constructor(readonly issuer: string, readonly tokenUrl: string | undefined,
    readonly authorizationUrl: string | undefined, readonly methods: readonly string[] | undefined) {}

  static parse(body: string): DiscoveryMetadata {
    const data = document(body);
    const issuer = string(data, 'issuer', true)!;
    const tokenUrl = string(data, 'token_endpoint');
    const authorizationUrl = string(data, 'authorization_endpoint');
    if (tokenUrl !== undefined) endpoint(tokenUrl);
    if (authorizationUrl !== undefined) endpoint(authorizationUrl);
    let methods: string[] | undefined;
    if ('token_endpoint_auth_methods_supported' in data) {
      const raw = data.token_endpoint_auth_methods_supported;
      if (!Array.isArray(raw) || raw.some(value => typeof value !== 'string')) throw new TokenProviderError();
      methods = raw;
    }
    return new DiscoveryMetadata(issuer, tokenUrl, authorizationUrl, methods);
  }
}

/** Internal token message, validated before conversion to application credentials. */
export class TokenSuccessResponse {
  private constructor(private readonly accessToken: string, private readonly tokenType: string,
    private readonly expiresIn: number | undefined, private readonly refreshToken: string | undefined,
    private readonly scope: string | undefined) {}

  static async parse(body: string): Promise<TokenSuccessResponse> {
    const data = document(body);
    let expiresIn: number | undefined;
    if ('expires_in' in data) {
      if (typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || !Number.isInteger(data.expires_in)) throw new TokenProviderError();
      expiresIn = data.expires_in;
    }
    const scope = string(data, 'scope');
    if (scope !== undefined && !/^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*(?![\s\S])/.test(scope)) throw new TokenProviderError();
    // ID tokens are outside this OAuth-only API. Pass only the fields it consumes;
    // oauth4webapi would otherwise also perform OIDC claim validation.
    const protocolFields = Object.fromEntries(
      ['access_token', 'token_type', 'expires_in', 'refresh_token', 'scope']
        .filter(key => key in data).map(key => [key, data[key]]));
    const parsed = await oauth.processGenericTokenEndpointResponse(
      { issuer: 'https://oauth.invalid' }, { client_id: 'sunday' }, Response.json(protocolFields));
    return new TokenSuccessResponse(parsed.access_token, parsed.token_type,
      expiresIn, parsed.refresh_token, scope);
  }

  tokens(scopes: readonly string[], now: number): TokenSet {
    if (this.tokenType.toLowerCase() !== 'bearer' || (this.scope !== undefined && !scopes.every(scope => this.scope!.split(' ').includes(scope)))) throw new TokenProviderError();
    let expiresAt: number | undefined;
    if (this.expiresIn !== undefined) {
      expiresAt = Math.floor(now) + this.expiresIn * 1000;
      if (this.expiresIn <= 0 || !Number.isSafeInteger(expiresAt)) throw new TokenProviderError();
    }
    return { accessToken: this.accessToken, expiresAt, refreshToken: this.refreshToken };
  }

  toString(): string { return 'OAuthSuccess()'; }
  toJSON(): string { return this.toString(); }
}

/** Internal error message; provider diagnostics never use descriptions from the server. */
export class TokenErrorResponse {
  private constructor(readonly code: string) {}
  static parse(body: string): TokenErrorResponse {
    const data = document(body);
    string(data, 'error_description');
    string(data, 'error_uri');
    return new TokenErrorResponse(string(data, 'error', true)!);
  }
  toString(): string { return 'OAuthError()'; }
  toJSON(): string { return this.toString(); }
}

/** Validates a selected or advertised endpoint before application authorization. */
export function endpoint(value: string | undefined): string {
  if (!value) throw new TokenProviderError();
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new TokenProviderError();
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new TokenProviderError();
  return url.toString();
}

function document(body: string): Record<string, unknown> {
  const data: unknown = JSON.parse(body);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TokenProviderError();
  return data as Record<string, unknown>;
}

function string(data: Record<string, unknown>, key: string, required = false): string | undefined {
  if (!(key in data)) {
    if (required) throw new TokenProviderError();
    return undefined;
  }
  if (typeof data[key] !== 'string' || !data[key]) throw new TokenProviderError();
  return data[key];
}
