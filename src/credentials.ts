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

import type { SecurityBinding, SecurityEndpoints } from './security-binding.js';
import type { TokenProvider, TokenRequest } from './token-provider.js';

/** Fresh application-authorized PKCE result; interactive authorization remains application-owned. */
export interface AuthorizationGrant {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

/** Transport-independent OAuth client configuration. */
export interface OAuthCredentialOptions {
  readonly identity: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly authentication?: 'none' | 'client_secret_basic' | 'client_secret_post';
  readonly grantIdentity?: string;
  readonly authorization?: (request: TokenRequest, signal: AbortSignal) => Promise<AuthorizationGrant>;
  readonly endpoints?: SecurityEndpoints;
  readonly issuer?: string;
}

/** Application-supplied bearer token, without its wire prefix. */
export interface BearerCredentials {
  readonly kind: 'bearer';
  readonly token: string;
}

/** Application-supplied API key; the contract determines its wire location. */
export interface ApiKeyCredentials {
  readonly kind: 'apiKey';
  readonly key: string;
}

/** Basic authentication inputs; the runtime supplies the wire encoding. */
export interface BasicCredentials {
  readonly kind: 'basic';
  readonly username: string;
  readonly password: string;
}

/** OAuth inputs narrowed to the selected acquisition flow. */
export type OAuthCredentials = {
  /** Builds the installed module's provider without acquiring tokens. */
  readonly providerFactory: (credentials: OAuthCredentials) => TokenProvider;
} & (
  | (OAuthCredentialOptions & { readonly kind: 'oauth'; readonly flow: 'clientCredentials' })
  | (OAuthCredentialOptions & {
    readonly kind: 'oauth'; readonly flow: 'authorizationCode';
    readonly grantIdentity: string;
    readonly authorization: NonNullable<OAuthCredentialOptions['authorization']>;
  }));

/** Escape hatch for application-owned acquisition and unsupported OAuth flows. */
export interface ProviderCredentials {
  readonly kind: 'provider';
  readonly provider: TokenProvider;
  readonly flow?: SecurityBinding['flow'];
}

/** Shared credential family; generated code narrows this union for each declared scheme. */
export type Credentials = BearerCredentials | ApiKeyCredentials | BasicCredentials | OAuthCredentials | ProviderCredentials;

/** Reject incompatible inputs before constructing a transport or acquiring a token. */
export function validateCredentials(credentials: Credentials, binding: SecurityBinding): void {
  if (credentials.kind === 'provider') {
    if (credentials.flow !== undefined && credentials.flow !== binding.flow) throw new TypeError('Provider flow does not match');
    return;
  }
  const prefix = binding.transport.prefix?.toLowerCase();
  if (credentials.kind === 'oauth') {
    validateOAuthCredentials(credentials, binding);
    return;
  }
  if (binding.flow !== 'static' && binding.flow !== 'external') {
    throw new TypeError('Static credentials cannot satisfy an OAuth acquisition binding');
  }
  if (credentials.kind === 'bearer' && (prefix !== 'bearer' || !credentials.token)) {
    throw new TypeError('Bearer credentials do not match the selected security binding');
  }
  if (credentials.kind === 'apiKey' && (prefix !== undefined || !credentials.key)) {
    throw new TypeError('API key credentials do not match the selected security binding');
  }
  if (credentials.kind === 'basic' && (prefix !== 'basic' || credentials.username.includes(':'))) {
    throw new TypeError('Basic credentials do not match the selected security binding');
  }
}


function validateOAuthCredentials(credentials: OAuthCredentials, binding: SecurityBinding): void {
  const prefix = binding.transport.prefix?.toLowerCase();
  if (prefix !== 'bearer' || credentials.flow !== binding.flow || !credentials.identity.trim() || !credentials.clientId.trim()) {
    throw new TypeError('OAuth credentials do not match the selected security binding');
  }
  const authentication = credentials.authentication ?? 'none';
  if (!['none', 'client_secret_basic', 'client_secret_post'].includes(authentication) || (authentication === 'none') !== (credentials.clientSecret === undefined) || credentials.clientSecret === '' ||
    (credentials.flow === 'clientCredentials' && authentication === 'none') ||
    (credentials.flow === 'authorizationCode' && (!credentials.grantIdentity.trim() || !credentials.authorization))) {
    throw new TypeError('Invalid OAuth credential configuration');
  }
}
