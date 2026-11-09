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

import { ownBody, bodyReads, sameBody } from './util/owned-body.js';
import { copyResponse } from './fetch-copy.js';
import { ResponseAdapter } from './response-adapter.js';
import { discardBody, withAbort } from './util/abort.js';

/** Explicit, flat, ordered composition of response adapters. No request capability is inferred. */
export class ResponseAdapters implements ResponseAdapter {
  readonly adapters: readonly ResponseAdapter[];

  constructor(...adapters: readonly ResponseAdapter[]) {
    this.adapters = Object.freeze(
      adapters.flatMap((adapter) =>
        adapter instanceof ResponseAdapters ? adapter.adapters : [adapter],
      ),
    );
  }

  /** Appends adapters without nesting execution pipelines. */
  chainTo(...next: readonly ResponseAdapter[]): ResponseAdapters {
    return new ResponseAdapters(this, ...next);
  }

  async adapt(response: Response, request: Request): Promise<Response> {
    return adaptResponse(this.adapters, response, request);
  }
}

/** Composes plain object adapters without inferring response capabilities from request adapters. */
export function chainResponseAdapters(
  ...adapters: readonly ResponseAdapter[]
): ResponseAdapters {
  return new ResponseAdapters(...adapters);
}

/** @internal Native Fetch bodies already own cancellation and must retain their byte-stream capabilities. */
export async function adaptResponse(
  adapters: readonly ResponseAdapter[],
  response: Response,
  request: Request,
  native = false,
): Promise<Response> {
  if (!adapters.length) {
    request.signal.throwIfAborted();
    return response;
  }
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal]);
  let current = response;
  const owned = (value: Response): Response => {
    if (!value.body || value.status === 0) return value;
    const body = ownBody(value.body, signal);
    if (body !== value.body) return copyResponse(value, { body });
    bodyReads(value);
    return value;
  };
  try {
    signal.throwIfAborted();
    if (!native) current = owned(current);
    for (const adapter of adapters) {
      const adapted = await withAbort(
        () => adapter.adapt(current, request),
        signal,
        discardBody,
      );
      if (sameBody(adapted.body, current.body)) {
        current = adapted;
        bodyReads(current);
      } else current = owned(adapted);
    }
    signal.throwIfAborted();
    return current;
  } catch (error) {
    cancellation.abort(error);
    discardBody(current, error);
    throw error;
  }
}
