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

import { beforeEach, describe, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import {
  FetchRequestFactory,
  MediaType,
} from '../src';
import { subscribe } from '../src/util/async-iterables';
import { SubscriptionLike } from '../src/util/subscriptions';

const waitFor = async <T>(
  promise: Promise<T>,
  timeoutMs = 5000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for promise'));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      });
  });

describe('subscribe to async iterable', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('consumes continuously until unsubscribed', async () => {
    let finalized = false;

    async function* source() {
      let value = 0;
      try {
        while (true) {
          await Promise.resolve();
          yield value++;
        }
      }
      finally {
        finalized = true;
      }
    }

    const received: number[] = [];
    let subscription: SubscriptionLike;
    subscription = subscribe(source(), {
      next: async (value) => {
        received.push(value);
        if (value >= 2) {
          subscription.unsubscribe();
        }
      },
    });

    await subscription.done;

    expect(received).toEqual([0, 1, 2]);
    expect(subscription.closed).toBeTrue();
    expect(finalized).toBeTrue();
  });

  it('unsubscribe is idempotent and sets closed', async () => {
    let resolveNext: ((value: IteratorResult<number>) => void) | undefined;
    let returnCalls = 0;

    const stream: AsyncIterable<number> = {
      [Symbol.asyncIterator](): AsyncIterator<number> {
        return {
          next(): Promise<IteratorResult<number>> {
            return new Promise((resolve) => {
              resolveNext = resolve;
            });
          },
          async return(): Promise<IteratorResult<number>> {
            returnCalls++;
            resolveNext?.({ value: undefined as unknown as number, done: true });
            return { value: undefined as unknown as number, done: true };
          },
        };
      },
    };

    const subscription = subscribe(stream, {
      next: () => undefined,
    });

    expect(subscription.closed).toBeFalse();

    subscription.unsubscribe();
    subscription.unsubscribe();

    await subscription.done;

    expect(subscription.closed).toBeTrue();
    expect(returnCalls).toBe(1);
  });

  it('calls iterator return on unsubscribe when available', async () => {
    let resolveNext: ((value: IteratorResult<number>) => void) | undefined;
    let returnCalled = false;

    const stream: AsyncIterable<number> = {
      [Symbol.asyncIterator](): AsyncIterator<number> {
        return {
          next(): Promise<IteratorResult<number>> {
            return new Promise((resolve) => {
              resolveNext = resolve;
            });
          },
          async return(): Promise<IteratorResult<number>> {
            returnCalled = true;
            resolveNext?.({ value: undefined as unknown as number, done: true });
            return { value: undefined as unknown as number, done: true };
          },
        };
      },
    };

    const subscription = subscribe(stream, {
      next: () => undefined,
    });

    subscription.unsubscribe();
    await subscription.done;

    expect(returnCalled).toBeTrue();
  });

  it('awaits async next handlers sequentially', async () => {
    const startOrder: number[] = [];
    const endOrder: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const subscription = subscribe(source(), {
      next: async (value) => {
        startOrder.push(value);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        endOrder.push(value);
        inFlight--;
      },
    });

    await subscription.done;

    expect(startOrder).toEqual([1, 2, 3]);
    expect(endOrder).toEqual([1, 2, 3]);
    expect(maxInFlight).toBe(1);
  });

  it('calls complete on normal stream completion', async () => {
    const received: number[] = [];
    let completeCalls = 0;

    async function* source() {
      yield 1;
      yield 2;
    }

    const subscription = subscribe(source(), {
      next: (value) => {
        received.push(value);
      },
      complete: () => {
        completeCalls++;
      },
    });

    await subscription.done;

    expect(received).toEqual([1, 2]);
    expect(completeCalls).toBe(1);
    expect(subscription.closed).toBeTrue();
  });

  it('calls error when the source iteration throws', async () => {
    const received: number[] = [];
    const errors: Error[] = [];

    async function* source() {
      yield 1;
      throw new Error('source failed');
    }

    const subscription = subscribe(source(), {
      next: (value) => {
        received.push(value);
      },
      error: (error) => {
        if (error instanceof Error) {
          errors.push(error);
        } else {
          errors.push(new Error(String(error)));
        }
      },
    });

    await subscription.done;

    expect(received).toEqual([1]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('source failed');
  });

  it('stops consumption after an observer next error', async () => {
    const received: number[] = [];
    let errorCalls = 0;
    let completeCalls = 0;
    let finalized = false;

    async function* source() {
      try {
        yield 1;
        yield 2;
        yield 3;
      }
      finally {
        finalized = true;
      }
    }

    const subscription = subscribe(source(), {
      next: (value) => {
        received.push(value);
        if (value === 1) {
          throw new Error('next failed');
        }
      },
      error: () => {
        errorCalls++;
      },
      complete: () => {
        completeCalls++;
      },
    });

    await subscription.done;

    expect(received).toEqual([1]);
    expect(errorCalls).toBe(1);
    expect(completeCalls).toBe(0);
    expect(finalized).toBeTrue();
  });

  it('consumes FetchRequestFactory eventStream and unsubscribes cleanly', async () => {
    const encodedEvent = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: {"target":"world"}\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([encodedEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get(
      'http://example.com',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
    });

    const stream = fetchRequestFactory.eventStream(
      { method: 'GET', pathTemplate: '' },
      (decoder, _event, _id, data) => decoder.decodeText(data, z.unknown()),
    );

    const received: unknown[] = [];
    let subscription: SubscriptionLike;
    subscription = subscribe(stream, {
      next: (value) => {
        received.push(value);
        subscription.unsubscribe();
      },
    });

    await waitFor(subscription.done);

    expect(subscription.closed).toBeTrue();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(expect.objectContaining({ target: 'world' }));
  });
});
