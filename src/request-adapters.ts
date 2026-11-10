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

import { inheritRequestContext } from './request-context.js';
import { bodyReads } from './util/owned-body.js';
import { RequestAdapter } from './request-adapter.js';
import { copyRequest } from './fetch-copy.js';
import { withAbort, discardBody } from './util/abort.js';

/** Flat, ordered composition; adapters may be ordinary objects with an adapt method. */
export class RequestAdapters implements RequestAdapter {
  readonly adapters: readonly RequestAdapter[];

  constructor(...adapters: readonly RequestAdapter[]) {
    this.adapters = Object.freeze(
      adapters.flatMap((adapter) =>
        adapter instanceof RequestAdapters ? adapter.adapters : [adapter],
      ),
    );
  }

  /** Appends adapters without nesting execution pipelines. */
  chainTo(...next: readonly RequestAdapter[]): RequestAdapters {
    return new RequestAdapters(this, ...next);
  }

  async adapt(request: Request): Promise<Request> {
    return adaptRequest(this.adapters, request);
  }
}

/** @internal Reports the effective signal while keeping invocation state out of the shared chain. */
export async function adaptRequest(
  adapters: readonly RequestAdapter[],
  request: Request,
  observeSignal: (signal: AbortSignal) => void = () => {},
): Promise<Request> {
  let signal = request.signal;
  try {
    bodyReads(request);
    for (const adapter of adapters) {
      const original = request;
      request = await withAbort(
        () => adapter.adapt(request),
        signal,
        discardBody,
      );
      inheritRequestContext(original, request);
      if (request.signal !== signal)
        request = copyRequest(request, {
          signal: AbortSignal.any([signal, request.signal]),
        });
      bodyReads(request);
      signal = request.signal;
      observeSignal(signal);
      signal.throwIfAborted();
    }
    signal.throwIfAborted();
    return request;
  } catch (error) {
    discardBody(request, error);
    throw error;
  }
}

/** Composes plain object adapters without requiring inheritance or modifying native prototypes. */
export function chainRequestAdapters(
  ...adapters: readonly RequestAdapter[]
): RequestAdapters {
  return new RequestAdapters(...adapters);
}
