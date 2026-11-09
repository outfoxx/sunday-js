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

import { inheritBody } from './util/owned-body.js';

/**
 * Copies native Fetch request settings and transfers responsibility for its body. The old request
 * must not subsequently consume the body. Supply a replacement after consuming a body.
 */
export function copyRequest(
  request: Request,
  changes: RequestInit & { url?: string | URL; duplex?: 'half' } = {},
): Request {
  const { url = request.url, ...init } = changes;
  const sameURL = String(url) === request.url;
  // Native Request copies inherit the input body for null as well as undefined. Bun may
  // instead return a bodyless request; inheritBody only records a transfer when a body exists.
  const originalBody = request.body;
  const body =
    init.body === undefined || (sameURL && init.body === null)
      ? originalBody
      : init.body;
  const result = sameURL
    ? new Request(request, init)
    : new Request(url, {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        cache: request.cache,
        credentials: request.credentials,
        integrity: request.integrity,
        keepalive: request.keepalive,
        mode: request.mode,
        redirect: request.redirect,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        ...(request.body ? { duplex: 'half' as const } : {}),
        ...init,
        body,
      });
  inheritBody(
    body instanceof ReadableStream ? body : undefined,
    result,
    body === originalBody ? request.body : undefined,
  );
  return result;
}

/**
 * Copies an inspectable response without teeing its body, retaining Fetch metadata.
 * Opaque/error responses cannot be reconstructed with the platform Response constructor.
 */
export function copyResponse(
  response: Response,
  changes: ResponseInit & { body?: BodyInit | null } = {},
): Response {
  const { body = response.body, ...init } = changes;
  const result = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    ...init,
  });
  for (const name of ['url', 'redirected', 'type'] as const) {
    Object.defineProperty(result, name, {
      value: response[name],
      configurable: true,
    });
  }
  inheritBody(body instanceof ReadableStream ? body : undefined, result);
  return result;
}
