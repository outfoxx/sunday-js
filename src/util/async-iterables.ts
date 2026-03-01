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

import { SubscriptionLike } from './subscriptions.js';

export async function firstValueFrom<T>(
  iterable: AsyncIterable<T>,
): Promise<T> {
  const next = await iterable[Symbol.asyncIterator]().next();
  if (next.done) {
    throw new Error('No value');
  }
  return next.value;
}

export type EventTargetAsyncIterableOverflow = 'preserve' | 'drop' | 'error';

export interface EventTargetAsyncIterableOptions {
  signal?: AbortSignal;
  overflow?: EventTargetAsyncIterableOverflow;
  highWaterMark?: number;
}

export function fromEvent<E extends Event = Event>(
  target: EventTarget,
  type: string,
  options: EventTargetAsyncIterableOptions = {},
): AsyncIterable<E> {
  const overflow = options.overflow ?? 'preserve';
  const highWaterMark = options.highWaterMark ?? 1;

  if (!Number.isFinite(highWaterMark) || highWaterMark < 0) {
    throw new TypeError(
      'fromEventTarget highWaterMark must be a finite number >= 0',
    );
  }

  let finalized = false;
  let eventListenerRegistered = false;
  let abortListenerRegistered = false;
  let controllerRef: ReadableStreamDefaultController<E> | undefined;

  const finalize = (): void => {
    if (finalized) {
      return;
    }

    finalized = true;

    if (eventListenerRegistered) {
      target.removeEventListener(type, onEvent);
      eventListenerRegistered = false;
    }

    if (abortListenerRegistered) {
      options.signal?.removeEventListener('abort', onAbort);
      abortListenerRegistered = false;
    }
  };

  const onAbort = (): void => {
    const controller = controllerRef;
    if (!controller || finalized) {
      return;
    }

    finalize();
    controller.close();
  };

  const onEvent = (event: Event): void => {
    const controller = controllerRef;
    if (!controller || finalized) {
      return;
    }

    if (overflow !== 'preserve') {
      const desiredSize = controller.desiredSize;
      if (desiredSize !== null && desiredSize <= 0) {
        if (overflow === 'drop') {
          return;
        }

        finalize();
        controller.error(
          new Error(`fromEventTarget("${type}") stream buffer overflow`),
        );
        return;
      }
    }

    controller.enqueue(event as E);
  };

  const stream = new ReadableStream<E>(
    {
      start(controller): void {
        controllerRef = controller;

        if (options.signal?.aborted) {
          finalize();
          controller.close();
          return;
        }

        target.addEventListener(type, onEvent);
        eventListenerRegistered = true;

        if (options.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
          abortListenerRegistered = true;
        }
      },
      cancel(): void {
        finalize();
      },
    },
    { highWaterMark },
  );

  async function* iterate(): AsyncGenerator<E> {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        yield next.value;
      }
    }
    finally {
      try {
        await reader.cancel();
      }
      catch {
        // no-op
      }
      reader.releaseLock();
    }
  }

  return {
    [Symbol.asyncIterator](): AsyncIterator<E> {
      return iterate();
    },
  };
}

export interface AsyncIterableObserver<E> {
  next(value: E): void | Promise<void>;
  error?(error: unknown): void | Promise<void>;
  complete?(): void | Promise<void>;
}

export function subscribe<E>(
  stream: AsyncIterable<E>,
  observer: AsyncIterableObserver<E>,
): SubscriptionLike {
  const iterator = stream[Symbol.asyncIterator]();

  let closed = false;
  let stopPromise: Promise<void> | undefined;

  const stop = (): Promise<void> => {
    if (stopPromise) {
      return stopPromise;
    }

    closed = true;

    stopPromise = (async () => {
      if (typeof iterator.return === 'function') {
        await iterator.return();
      }
    })().catch(() => undefined);

    return stopPromise;
  };

  const done = (async (): Promise<void> => {
    try {
      while (!closed) {
        const next = await iterator.next();
        if (closed) {
          break;
        }

        if (next.done) {
          await observer.complete?.();
          closed = true;
          break;
        }

        await observer.next(next.value);
      }
    }
    catch (error) {
      if (!closed) {
        if (observer.error) {
          await observer.error(error);
          await stop();
          return;
        }

        await stop();
        throw error;
      }
    }
    finally {
      if (stopPromise) {
        await stopPromise;
      }
      closed = true;
    }
  })();

  return {
    get closed(): boolean {
      return closed;
    },
    unsubscribe(): void {
      if (closed) {
        return;
      }
      void stop();
    },
    done,
  };
}
