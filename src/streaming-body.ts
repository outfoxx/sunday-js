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

/** Binary chunk values supported by streaming request bodies. */
export type StreamingBodyChunk = ArrayBuffer | Uint8Array;

/** Creates a fresh async byte sequence for a streaming request body. */
export type StreamingBodyBytesFactory = () => AsyncIterable<StreamingBodyChunk>;

/** Creates a fresh web readable stream for a streaming request body. */
export type StreamingBodyStreamFactory = () => ReadableStream<Uint8Array>;

/** A lazily-created request body for streaming uploads. */
export class StreamingBody {
  private constructor(
    private readonly createBody: () => BodyInit,
  ) {
  }

  /** Creates a streaming body from a reusable web platform `Blob`. */
  static blob(blob: Blob): StreamingBody {
    return new StreamingBody(() => blob);
  }

  /** Creates a streaming body from a fresh web `ReadableStream` factory. */
  static stream(factory: StreamingBodyStreamFactory): StreamingBody {
    return new StreamingBody(factory);
  }

  /** Creates a streaming body from a fresh async byte iterable factory. */
  static bytes(factory: StreamingBodyBytesFactory): StreamingBody {
    return new StreamingBody(() => asyncBytesToReadableStream(factory()));
  }

  /** Creates the web platform body value consumed by `fetch`. */
  toBodyInit(): BodyInit {
    return this.createBody();
  }
}

/** Returns true when a value is a Sunday streaming request body. */
export function isStreamingBody(value: unknown): value is StreamingBody {
  return value instanceof StreamingBody;
}

function asyncBytesToReadableStream(
  bytes: AsyncIterable<StreamingBodyChunk>,
): ReadableStream<Uint8Array> {
  const iterator = bytes[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      try {
        const next = await iterator.next();
        if (next.done === true) {
          controller.close();
          return;
        }
        controller.enqueue(toUint8Array(next.value));
      }
      catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason): Promise<void> {
      await iterator.return?.(reason);
    },
  });
}

function toUint8Array(chunk: StreamingBodyChunk): Uint8Array {
  return chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
}
