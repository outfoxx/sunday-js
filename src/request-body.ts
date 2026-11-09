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

import { ownBody } from './util/owned-body.js';

/** Cancellation and memory bound for converting an upload stream into a Blob. */
export interface RequestBodyBufferOptions {
  /** Cancels reading and preserves the original abort reason. */
  signal?: AbortSignal;
  /** Maximum buffered bytes; defaults to 16 MiB. Does not limit native streaming uploads. */
  maxBytes?: number;
}

let streamingUploadsSupported: boolean | undefined;

/**
 * Checks runtime support without sending a request. This does not test server/protocol support.
 * The result is cached for the current runtime's native Fetch implementation.
 */
export function supportsStreamingUploads(): boolean {
  if (streamingUploadsSupported !== undefined) return streamingUploadsSupported;
  let duplexAccessed = false;
  try {
    const request = new Request('https://localhost/', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      get duplex() {
        duplexAccessed = true;
        return 'half' as const;
      },
    } as RequestInit);
    // Bun supports streaming uploads without reading duplex. Firefox instead coerces the
    // stream to a string and adds Content-Type; older WebKit accepts it but ignores duplex.
    streamingUploadsSupported =
      !request.headers.has('Content-Type') &&
      (duplexAccessed || 'Bun' in globalThis);
  } catch {
    streamingUploadsSupported = false;
  }
  return streamingUploadsSupported;
}

/**
 * Prepares a BodyInit before constructing a Request, buffering streams only when unsupported.
 * Adapters replacing bodies should call this before copyRequest/new Request. Supported streams
 * retain streaming and receive cooperative cancellation; other bodies pass through unchanged.
 * This does not confer permission to retry.
 */
export async function prepareRequestBody<T extends BodyInit | null | undefined>(
  body: T,
  options: RequestBodyBufferOptions = {},
): Promise<T | Blob | ReadableStream<Uint8Array>> {
  if (body instanceof ReadableStream) {
    if (!supportsStreamingUploads()) return bufferToBlob(body, options);
    const stream = ownBody(body, options.signal);
    options.signal?.throwIfAborted();
    return stream;
  }
  options.signal?.throwIfAborted();
  return body;
}

/**
 * Consumes a byte stream into a bounded Blob. Cancels the source on failure without waiting for
 * its cleanup, and rethrows the original read error or abort reason. No stream tee or retry occurs.
 */
export async function bufferToBlob(
  stream: ReadableStream<Uint8Array>,
  { signal, maxBytes = 16 * 1024 * 1024 }: RequestBodyBufferOptions = {},
): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer');
  }
  const reader = ownBody(stream, signal).getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new TypeError('Upload streams must produce Uint8Array chunks');
      }
      if (value.byteLength > maxBytes - size) {
        throw new RangeError(`Buffered request body exceeds ${maxBytes} bytes`);
      }
      // Snapshot each chunk before asking the producer for more; it may reuse its buffer.
      if (value.byteLength) parts.push(new Uint8Array(value));
      size += value.byteLength;
    }
    signal?.throwIfAborted();
    return new Blob(parts);
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
