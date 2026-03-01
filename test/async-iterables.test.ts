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

import { describe, expect, it } from 'bun:test';
import { delay } from './promises.js';
import { fromEvent } from '../src/util/async-iterables';

class CountingEventTarget extends EventTarget {
  addCalls = 0;
  removeCalls = 0;

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.addCalls++;
    super.addEventListener(type, callback, options);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removeCalls++;
    super.removeEventListener(type, callback, options);
  }
}

describe('fromEventTarget', () => {
  it('yields events in dispatch order', async () => {
    const target = new EventTarget();
    const stream = fromEvent<CustomEvent<number>>(target, 'tick');

    const consume = (async () => {
      const received: number[] = [];
      for await (const event of stream) {
        received.push(event.detail);
        if (received.length === 3) {
          break;
        }
      }
      return received;
    })();

    target.dispatchEvent(new CustomEvent('tick', { detail: 1 }));
    target.dispatchEvent(new CustomEvent('tick', { detail: 2 }));
    target.dispatchEvent(new CustomEvent('tick', { detail: 3 }));

    expect(await consume).toEqual([1, 2, 3]);
  });

  it('removes listener when consumer exits early', async () => {
    const target = new CountingEventTarget();
    const stream = fromEvent<CustomEvent<number>>(target, 'tick');

    const consume = (async () => {
      for await (const event of stream) {
        expect(event.detail).toBe(10);
        break;
      }
    })();

    target.dispatchEvent(new CustomEvent('tick', { detail: 10 }));
    await consume;

    expect(target.addCalls).toBe(1);
    expect(target.removeCalls).toBe(1);
  });

  it('completes immediately when abort signal is already aborted', async () => {
    const target = new CountingEventTarget();
    const controller = new AbortController();
    controller.abort();

    const stream = fromEvent(target, 'tick', { signal: controller.signal });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();

    expect(first.done).toBeTrue();
    expect(target.addCalls).toBe(0);
    expect(target.removeCalls).toBe(0);
  });

  it('completes when abort fires while waiting for next event', async () => {
    const target = new CountingEventTarget();
    const controller = new AbortController();
    const stream = fromEvent(target, 'tick', { signal: controller.signal });
    const iterator = stream[Symbol.asyncIterator]();

    const next = iterator.next();
    controller.abort();

    const result = await next;
    expect(result.done).toBeTrue();
    expect(target.addCalls).toBe(1);
    expect(target.removeCalls).toBe(1);
  });

  it('drops events when overflow policy is drop', async () => {
    const target = new EventTarget();
    const stream = fromEvent<CustomEvent<number>>(target, 'tick', {
      overflow: 'drop',
      highWaterMark: 1,
    });
    const iterator = stream[Symbol.asyncIterator]();

    target.dispatchEvent(new CustomEvent('tick', { detail: 1 }));
    target.dispatchEvent(new CustomEvent('tick', { detail: 2 }));

    const first = await iterator.next();
    expect(first.done).toBeFalse();
    expect(first.value.detail).toBe(1);

    const second = iterator.next();
    expect(
      await Promise.race([
        second.then(() => 'resolved'),
        delay(10).then(() => 'pending'),
      ]),
    ).toBe('pending');

    target.dispatchEvent(new CustomEvent('tick', { detail: 4 }));
    const resumed = await second;

    expect(resumed.done).toBeFalse();
    expect(resumed.value.detail).toBe(4);

    await iterator.return?.();
  });

  it('errors iteration when overflow policy is error', async () => {
    const target = new EventTarget();
    const stream = fromEvent(target, 'tick', {
      overflow: 'error',
      highWaterMark: 1,
    });
    const iterator = stream[Symbol.asyncIterator]();

    target.dispatchEvent(new CustomEvent('tick', { detail: 1 }));
    target.dispatchEvent(new CustomEvent('tick', { detail: 2 }));

    await expect(iterator.next()).rejects.toThrow(/buffer overflow/i);
  });

  it('supports typed custom events through generic parameter', async () => {
    const target = new EventTarget();
    const stream = fromEvent<CustomEvent<{ value: number }>>(
      target,
      'typed',
    );

    const consume = (async () => {
      for await (const event of stream) {
        return event.detail.value;
      }
      return -1;
    })();

    target.dispatchEvent(new CustomEvent('typed', { detail: { value: 42 } }));

    expect(await consume).toBe(42);
  });
});
