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

import { withAbort } from './abort.js';

// Ownership follows the stream through native Request copies; no request execution state is attached.
interface BodyReference {
  readonly source: ReadableStream<Uint8Array>;
  readonly owner?: BodyOwner;
}
const bodies = new WeakMap<ReadableStream<Uint8Array>, BodyReference>();

/** @internal Owns only application streams, preserving byte-stream capability and backpressure. */
export function ownBody(
  source: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const existing = bodies.get(source)?.owner;
  if (existing) {
    existing.observe(signal);
    return source;
  }
  const owner = new BodyOwner(source);
  bodies.set(owner.stream, { source: owner.stream, owner });
  owner.observe(signal);
  return owner.stream;
}

/** @internal Transfers body metadata and retires unused native branches without consuming the active body. */
export function inheritBody(
  source: ReadableStream<Uint8Array> | null | undefined,
  target: Request | Response,
  previousBody?: ReadableStream<Uint8Array> | null,
): void {
  if (source && target.body) {
    const reference: BodyReference = bodies.get(source) ?? { source };
    // Bun leaves a new tee branch on the input. Ownership has transferred, so retire that
    // unused branch immediately to prevent buffering and to let later cancellation reach the source.
    if (previousBody && previousBody !== source && previousBody !== target.body)
      void cancelStream(previousBody);
    bodies.set(target.body, reference);
    if (target instanceof Request) reference.owner?.observe(target.signal);
  }
  bodyReads(target);
}

/** @internal Recognizes constructor-transferred bodies even when a runtime creates a new stream handle. */
export function sameBody(
  left: ReadableStream<Uint8Array> | null,
  right: ReadableStream<Uint8Array> | null,
): boolean {
  return (
    left === right ||
    !!(
      left &&
      right &&
      (bodies.get(left)?.source ?? left) ===
        (bodies.get(right)?.source ?? right)
    )
  );
}

/** @internal Restores errors only at a native read/fetch boundary, never around application callbacks. */
export async function nativeBodyOperation<T>(
  body: ReadableStream<Uint8Array> | null | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const owner = body && bodies.get(body)?.owner;
  try {
    // Start the native operation immediately to retain synchronous bodyUsed/locking behavior.
    const operation = action();
    // A stop can win before withAbort invokes its callback; observe the native result regardless.
    void operation.catch(() => undefined);
    // WebKit can leave an in-flight native bulk read pending after its stream errors.
    return await (owner && !owner.failure.signal.aborted
      ? withAbort(() => operation, owner.failure.signal)
      : operation);
  } catch (error) {
    throw owner?.failure.signal.aborted ? owner.failure.signal.reason : error;
  }
}

/** @internal Gives native bulk reads exact source errors and request reads cooperative cancellation. */
export function bodyReads(value: Request | Response): void {
  if (!value.body) return;
  const request = value instanceof Request;
  if (!request && !bodies.get(value.body)?.owner) return;
  const prototype = request ? Request.prototype : Response.prototype;
  for (const name of [
    'arrayBuffer',
    'blob',
    'bytes',
    'formData',
    'json',
    'text',
  ] as const) {
    const native = prototype[name] as (() => Promise<unknown>) | undefined;
    // Preserve custom overrides and avoid decorating an instance twice.
    if (!native || value[name] !== native) continue;
    Object.defineProperty(value, name, {
      configurable: true,
      writable: true,
      value: async function (this: Request | Response): Promise<unknown> {
        if (this !== value || this.bodyUsed || !this.body || this.body.locked)
          return native.call(this);
        if (this instanceof Request && !bodies.get(this.body)?.owner) {
          // Defer ownership until the adapter actually reads. Unread Blob/string requests keep
          // their native replayable sources, including native redirects and follow-ups.
          const body = ownBody(this.body, this.signal);
          bodies.set(this.body, bodies.get(body)!);
          const response = new Response(body, { headers: this.headers });
          const read = Response.prototype[name] as () => Promise<unknown>;
          return nativeBodyOperation(body, () => read.call(response));
        }
        return nativeBodyOperation(this.body, () => native.call(this));
      },
    });
  }
}

/** @internal Disposes transferred bodies without waiting for user cleanup or replacing the original error. */
export function discardBody(value: Request | Response, reason?: unknown): void {
  try {
    const body = value.body;
    if (!body) return;
    const reference = bodies.get(body);
    if (reference?.owner) {
      reference.owner.stop(reason);
      return;
    }
    void cancelStream(body, reason);
  } catch {
    // Custom body accessors must not replace the operation's error either.
  }
}

async function cancelStream(
  stream: ReadableStream<Uint8Array>,
  reason?: unknown,
): Promise<void> {
  try {
    if (!stream.locked) await stream.cancel(reason);
  } catch {
    // Cleanup failures must not replace the operation's outcome.
  }
}

class BodyOwner {
  readonly stream: ReadableStream<Uint8Array>;
  readonly failure = new AbortController();
  private readonly reader:
    | ReadableStreamDefaultReader<Uint8Array>
    | ReadableStreamBYOBReader;
  private controller!:
    | ReadableStreamDefaultController<Uint8Array>
    | ReadableByteStreamController;
  private closed = false;
  private readonly listeners = new Map<AbortSignal, () => void>();

  // WebKit can recreate a native Request.body wrapper if only its reader remains reachable.
  // Keep the source handle alive so ownership lookups survive garbage collection during reads.
  constructor(private readonly source: ReadableStream<Uint8Array>) {
    // Keep the selected reader: some byte producers can only fill a supplied BYOB view.
    let bytes = false;
    try {
      this.reader = this.source.getReader({ mode: 'byob' });
      bytes = true;
    } catch (error) {
      if (this.source.locked) throw error;
      this.reader = this.source.getReader();
    }
    const underlying = {
      start: (
        controller:
          | ReadableStreamDefaultController<Uint8Array>
          | ReadableByteStreamController,
      ) => {
        this.controller = controller;
      },
      pull: () => this.pull(),
      cancel: (reason: unknown) => this.cancel(reason),
    };
    // Do not read ahead on behalf of a consumer. Native Response methods still collect whole chunks.
    this.stream = bytes
      ? new ReadableStream(
          { ...underlying, type: 'bytes', autoAllocateChunkSize: 64 * 1024 },
          { highWaterMark: 0 },
        )
      : new ReadableStream(underlying, { highWaterMark: 0 });
  }

  observe(signal?: AbortSignal): void {
    if (!signal || this.closed || this.listeners.has(signal)) return;
    if (signal.aborted) {
      this.stop(signal.reason);
      return;
    }
    const abort = () => this.stop(signal.reason);
    this.listeners.set(signal, abort);
    signal.addEventListener('abort', abort, { once: true });
  }

  cancel(reason?: unknown): void {
    if (this.closed) return;
    // Cleanup cannot delay or replace the original failure, even if user cleanup never settles.
    void this.reader.cancel(reason).catch(() => undefined);
    this.finish();
  }

  stop(reason: unknown): void {
    if (this.closed) return;
    this.failure.abort(reason);
    this.controller.error(reason);
    this.cancel(reason);
  }

  private async pull(): Promise<void> {
    try {
      const byob =
        'byobRequest' in this.controller
          ? this.controller.byobRequest!
          : undefined;
      // Auto-allocation supplies a view for default/bulk consumers too. Forward the returned
      // view because the source reader transfers its buffer, detaching the original view.
      const result = byob
        ? await (this.reader as ReadableStreamBYOBReader).read(byob.view!)
        : await (this.reader as ReadableStreamDefaultReader<Uint8Array>).read();
      if (this.closed) return;
      if (result.done) {
        this.controller.close();
        if (byob) byob.respondWithNewView(result.value!);
        this.finish();
      } else if (byob) {
        byob.respondWithNewView(result.value as ArrayBufferView<ArrayBuffer>);
      } else {
        this.controller.enqueue(result.value as Uint8Array<ArrayBuffer>);
      }
    } catch (error) {
      if (this.closed) return;
      this.failure.abort(error);
      this.controller.error(error);
      this.finish();
    }
  }

  private finish(): void {
    this.closed = true;
    for (const [signal, listener] of this.listeners)
      signal.removeEventListener('abort', listener);
    this.listeners.clear();
    try {
      this.reader.releaseLock();
    } catch {
      // Bun leaves pending BYOB reads unsettled after cancel(), and refuses lock release.
      // The output is already terminated; native cleanup must not replace that outcome.
    }
  }
}
