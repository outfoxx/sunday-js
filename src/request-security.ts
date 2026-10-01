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
import { TokenLease, TokenManager } from './token-manager.js';
import { TokenProviderError } from './token-provider.js';

/** Per-request credentials, retained only for conditional invalidation and bounded recovery. */
export interface AuthorizedRequest {
  readonly request: Request;
  readonly bindings: readonly SecurityBinding[];
  readonly leases: readonly TokenLease[];
}

/** Adds all credentials atomically after every provider succeeds. */
export async function authorizeRequest(
  request: Request,
  bindings: readonly SecurityBinding[],
  manager: TokenManager | undefined,
  previous?: AuthorizedRequest,
): Promise<AuthorizedRequest> {
  if (!manager) throw new TokenProviderError();
  const names = new Set<string>();
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const binding of bindings) {
    const transport = binding.transport;
    const name = `${transport.location}:${transport.location === 'header' ? transport.name.toLowerCase() : transport.name}`;
    if (names.has(name)) throw new TokenProviderError();
    names.add(name);
    if (!previous && (
      (transport.location === 'header' && headers.has(transport.name)) ||
      (transport.location === 'query' && url.searchParams.has(transport.name)) ||
      (transport.location === 'cookie' && cookieEntries(headers).some(([name]) => name === transport.name))
    )) throw new TokenProviderError();
  }
  const leases = await Promise.all(bindings.map(binding => manager.credentials(binding, request.signal)));
  request.signal.throwIfAborted();
  bindings.forEach((binding, index) => {
    const token = leases[index].tokens.accessToken;
    const transport = binding.transport;
    const credential = transport.prefix ? `${transport.prefix} ${token}` : token;
    switch (transport.location) {
      case 'header': {
        if ([...credential].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new TokenProviderError();
        headers.set(transport.name, credential);
        break;
      }
      case 'query': replaceQueryCredential(url, transport.name, credential); break;
      case 'cookie': {
        const entries = cookieEntries(headers).filter(([name]) => name !== transport.name);
        entries.push([transport.name, encodeURIComponent(credential)]);
        headers.set('Cookie', entries.map(([name, value]) => `${name}=${value}`).join('; '));
        break;
      }
    }
  });
  // Passing the body explicitly avoids Request's internal stream proxy, which can stall uploads in Bun.
  // Manual redirects also protect custom API-key headers and cookies from crossing origins.
  const authorized = url.toString() === request.url && request.redirect === 'manual' ? request :
    new Request(url, {
      method: request.method, headers, body: request.body, signal: request.signal,
      cache: request.cache, credentials: request.credentials, integrity: request.integrity,
      keepalive: request.keepalive, mode: request.mode, redirect: 'manual',
      referrer: request.referrer, referrerPolicy: request.referrerPolicy,
      ...(request.body ? { duplex: 'half' } : {}),
    });
  for (const [name, value] of headers) authorized.headers.set(name, value);
  return { request: authorized, bindings, leases };
}

/** Requires a safe, replayable request and an explicit bearer invalid-token challenge. */
export function canRecoverAuthentication(request: AuthorizedRequest, response: Response): boolean {
  return response.status === 401 && ['GET', 'HEAD', 'OPTIONS'].includes(request.request.method) &&
    request.request.body === null && request.bindings.some(isBearerBinding) &&
    hasInvalidBearerChallenge(response.headers.get('WWW-Authenticate') ?? '');
}

/** Returns only bearer receipts rejected by an invalid-token challenge, preserving other conjuncts. */
export function rejectedBearerLeases(request: AuthorizedRequest): readonly TokenLease[] {
  return request.leases.filter((_, index) => isBearerBinding(request.bindings[index]));
}

function isBearerBinding(binding: SecurityBinding): boolean {
  return binding.transport.location === 'header' && binding.transport.name.toLowerCase() === 'authorization' &&
    binding.transport.prefix?.toLowerCase() === 'bearer';
}

/** Removes query credentials from responses before error translation or diagnostic rendering. */
export function redactSecurityResponse(response: Response, bindings: readonly SecurityBinding[]): Response {
  const queryNames = bindings.filter(binding => binding.transport.location === 'query').map(binding => binding.transport.name);
  if (!queryNames.length || !response.url) return response;
  const url = new URL(response.url);
  for (const name of queryNames) if (url.searchParams.has(name)) replaceQueryCredential(url, name, '[redacted]');
  const result = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
  Object.defineProperty(result, 'url', { value: url.toString() });
  return result;
}

function hasInvalidBearerChallenge(header: string): boolean {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < header.length; index++) {
    const character = header[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && character === '\\') { escaped = true; continue; }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === ',') { parts.push(header.slice(start, index).trim()); start = index + 1; }
  }
  if (quoted || escaped) return false;
  parts.push(header.slice(start).trim());
  let bearer = false;
  for (let part of parts) {
    const challenge = /^([a-z][a-z0-9_-]*)\s+(?!\s*=)(.*)$/i.exec(part);
    if (challenge) { bearer = challenge[1].toLowerCase() === 'bearer'; part = challenge[2]; }
    else if (/^[a-z][a-z0-9_-]*$/i.test(part)) bearer = false;
    const error = /^error\s*=\s*(?:"([^"]*)"|([^"\s]+))$/i.exec(part);
    if (bearer && (error?.[1] ?? error?.[2]) === 'invalid_token') return true;
  }
  return false;
}

function cookieEntries(headers: Headers): [string, string][] {
  return (headers.get('Cookie') ?? '').split(';').flatMap(entry => {
    const split = entry.indexOf('=');
    return split < 0 ? [] : [[entry.slice(0, split).trim(), entry.slice(split + 1).trim()]];
  });
}

// URLSearchParams re-encodes unrelated values, which can invalidate application-signed query parameters.
function replaceQueryCredential(url: URL, name: string, credential: string): void {
  const fields = (url.search ? url.search.slice(1).split('&') : []).filter(field => {
    const key = field.split('=', 1)[0];
    try { return decodeURIComponent(key.replace(/\+/g, ' ')) !== name; }
    catch { return true; }
  });
  fields.push(`${encodeURIComponent(name)}=${encodeURIComponent(credential)}`);
  url.search = fields.join('&');
}
