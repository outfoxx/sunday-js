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
import { prepareRequestBody } from './request-body.js';
import { copyRequest, copyResponse } from './fetch-copy.js';
import { RequestCancellationError } from './request-cancellation-error.js';
import { SecurityBinding } from './security-binding.js';
import { TokenLease } from './token-manager.js';
import {
  TokenProvider,
  TokenProviderError,
  providerCredentials,
} from './token-provider.js';

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
  providers: Readonly<Record<string, TokenProvider>>,
  maxBufferedRequestBytes?: number,
): Promise<AuthorizedRequest> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  validateTransports(bindings, url, headers);
  // Resolve every binding before starting work, so setup failure cannot strand earlier promises.
  const selected = bindings.map((binding) => {
    const provider = Object.hasOwn(providers, binding.provider)
      ? providers[binding.provider]
      : undefined;
    if (!provider) throw new TokenProviderError();
    return { binding, provider };
  });
  const acquisition = new AbortController();
  const signal = AbortSignal.any([request.signal, acquisition.signal]);
  let leases: TokenLease[];
  try {
    leases = await withAbort(
      () =>
        Promise.all(
          selected.map(({ binding, provider }) =>
            providerCredentials(provider, binding, signal),
          ),
        ),
      signal,
    );
  } catch (error) {
    // Promise.all is fail-fast, but siblings still need a cooperative stop signal.
    acquisition.abort(error);
    throw error;
  }
  request.signal.throwIfAborted();
  bindings.forEach((binding, index) =>
    applyCredential(binding, leases[index].tokens.accessToken, url, headers),
  );
  // Changing URL reconstructs Request from settings. Firefox does not expose Request.body,
  // so retain its already-buffered native body through blob() instead of silently dropping it.
  let body: BodyInit | undefined;
  if (url.href !== request.url) {
    if (request.body) {
      body = await prepareRequestBody(request.body, {
        signal: request.signal,
        maxBytes: maxBufferedRequestBytes,
      });
    } else if (
      request.body === undefined &&
      !['GET', 'HEAD'].includes(request.method)
    ) {
      const buffered = await request.blob();
      if (buffered.size) body = buffered;
    }
  }
  const authorized = copyRequest(request, {
    ...(body !== undefined ? { body } : {}),
    url,
    headers,
    redirect: 'manual',
    credentials: 'omit',
  });
  return { request: authorized, bindings, leases };
}

/** Proves body absence without treating an unavailable Request.body property as an empty body. */
export function isBodylessRequest(request: Request): boolean {
  // Fetch forbids bodies on GET/HEAD. Other methods require an inspectable null body.
  return (
    request.method === 'GET' ||
    request.method === 'HEAD' ||
    request.body === null
  );
}

/** Requires a safe, replayable request and an explicit bearer invalid-token challenge. */
export function canRecoverAuthentication(
  request: Request,
  response: Response,
): boolean {
  return (
    response.status === 401 &&
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    isBodylessRequest(request) &&
    /^Bearer[ \t]+[^ \t]+$/i.test(request.headers.get('Authorization') ?? '') &&
    hasInvalidBearerChallenge(response.headers.get('WWW-Authenticate') ?? '')
  );
}

/** Returns only bearer receipts rejected by an invalid-token challenge, preserving other conjuncts. */
export function rejectedBearerLeases(
  request: AuthorizedRequest,
): readonly TokenLease[] {
  const token = /^Bearer[ \t]+([^ \t]+)$/i.exec(
    request.request.headers.get('Authorization') ?? '',
  )?.[1];
  return request.leases.filter(
    (lease, index) =>
      isBearerBinding(request.bindings[index]) &&
      token === lease.tokens.accessToken,
  );
}

function isBearerBinding(binding: SecurityBinding): boolean {
  return (
    binding.transport.location === 'header' &&
    binding.transport.name.toLowerCase() === 'authorization' &&
    binding.transport.prefix?.toLowerCase() === 'bearer'
  );
}

/** Removes query credentials from responses before error translation or diagnostic rendering. */
export function redactSecurityResponse(
  response: Response,
  bindings: readonly SecurityBinding[],
): Response {
  const queryNames = bindings
    .filter((binding) => binding.transport.location === 'query')
    .map((binding) => binding.transport.name);
  if (!queryNames.length || !response.url) return response;
  const url = new URL(response.url);
  for (const name of queryNames)
    if (url.searchParams.has(name))
      replaceQueryCredential(url, name, '[redacted]');
  if (url.href === response.url) return response;
  // Filtered responses cannot be reconstructed; preserve the native response and its hidden body.
  const result = response.status === 0 ? response : copyResponse(response);
  Object.defineProperty(result, 'url', { value: url.href, configurable: true });
  return result;
}

export function hasInvalidBearerChallenge(header: string): boolean {
  const parts = splitChallenges(header);
  if (!parts) return false;
  let bearer = false;
  for (let part of parts) {
    const challenge = /^([a-z][a-z0-9_-]*)\s+(?!\s*=)(.*)$/i.exec(part);
    if (challenge) {
      bearer = challenge[1].toLowerCase() === 'bearer';
      part = challenge[2];
    } else if (/^[a-z][a-z0-9_-]*$/i.test(part)) bearer = false;
    const error = /^error\s*=\s*(?:"([^"]*)"|([^"\s]+))$/i.exec(part);
    if (bearer && (error?.[1] ?? error?.[2]) === 'invalid_token') return true;
  }
  return false;
}

function cookieEntries(headers: Headers): [string, string][] {
  return (headers.get('Cookie') ?? '').split(';').flatMap((entry) => {
    const split = entry.indexOf('=');
    return split < 0
      ? []
      : [[entry.slice(0, split).trim(), entry.slice(split + 1).trim()]];
  });
}

// URLSearchParams re-encodes unrelated values, which can invalidate application-signed query parameters.
function replaceQueryCredential(
  url: URL,
  name: string,
  credential: string,
): void {
  const fields = (url.search ? url.search.slice(1).split('&') : []).filter(
    (field) => {
      const key = field.split('=', 1)[0];
      try {
        return decodeURIComponent(key.replaceAll('+', ' ')) !== name;
      } catch {
        return true;
      }
    },
  );
  fields.push(`${encodeURIComponent(name)}=${encodeURIComponent(credential)}`);
  url.search = fields.join('&');
}

function validateTransports(
  bindings: readonly SecurityBinding[],
  url: URL,
  headers: Headers,
): void {
  const names = new Set<string>();
  for (const binding of bindings) {
    const transport = binding.transport;
    const name = `${transport.location}:${transport.location === 'header' ? transport.name.toLowerCase() : transport.name}`;
    if (names.has(name)) throw new TokenProviderError();
    names.add(name);
    if (
      (transport.location === 'header' && headers.has(transport.name)) ||
      (transport.location === 'query' &&
        url.searchParams.has(transport.name)) ||
      (transport.location === 'cookie' &&
        cookieEntries(headers).some(([name]) => name === transport.name))
    )
      throw new TokenProviderError();
  }
}

function applyCredential(
  binding: SecurityBinding,
  token: string,
  url: URL,
  headers: Headers,
): void {
  const transport = binding.transport;
  const credential = transport.prefix ? `${transport.prefix} ${token}` : token;
  switch (transport.location) {
    case 'header': {
      if (
        [...credential].some(
          (character) =>
            character.codePointAt(0)! < 32 || character.codePointAt(0)! === 127,
        )
      )
        throw new TokenProviderError();
      headers.set(transport.name, credential);
      break;
    }
    case 'query':
      replaceQueryCredential(url, transport.name, credential);
      break;
    case 'cookie': {
      const entries = cookieEntries(headers).filter(
        ([name]) => name !== transport.name,
      );
      entries.push([transport.name, encodeURIComponent(credential)]);
      headers.set(
        'Cookie',
        entries.map(([name, value]) => `${name}=${value}`).join('; '),
      );
      break;
    }
  }
}

function splitChallenges(header: string): string[] | undefined {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < header.length; index++) {
    const character = header[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === ',') {
      parts.push(header.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || escaped) return undefined;
  parts.push(header.slice(start).trim());
  return parts;
}

/** Reports all matching rejections, including unsafe requests and exhausted recovery budgets. */
export async function rejectCredentials(
  request: AuthorizedRequest,
  response: Response,
): Promise<void> {
  if (
    response.status !== 401 ||
    !hasInvalidBearerChallenge(response.headers.get('WWW-Authenticate') ?? '')
  )
    return;
  let recoverable = true;
  for (const lease of rejectedBearerLeases(request))
    recoverable = ((await lease.invalidate?.()) ?? false) && recoverable;
  if (!recoverable)
    throw new RequestCancellationError(
      'The credential owner rejected authentication recovery',
    );
}
