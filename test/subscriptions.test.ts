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
import { Subscription } from '../src/util/subscriptions.js';
import { delay } from './promises.js';

describe('Subscription', () => {
  it('starts open with a pending done promise', async () => {
    const subscription = new Subscription();

    expect(subscription.closed).toBeFalse();
    expect(
      await Promise.race([
        subscription.done.then(() => 'resolved'),
        delay(10).then(() => 'pending'),
      ]),
    ).toBe('pending');

    subscription.unsubscribe();
    await subscription.done;
  });

  it('unsubscribes every added child', async () => {
    const subscription = new Subscription();
    let firstCalls = 0;
    let secondCalls = 0;

    subscription.add({
      unsubscribe(): void {
        firstCalls++;
      },
    });
    subscription.add(() => secondCalls++);

    subscription.unsubscribe();
    await subscription.done;

    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
    expect(subscription.closed).toBeTrue();
  });

  it('does not unsubscribe removed children', async () => {
    const subscription = new Subscription();
    let keptCalls = 0;
    let removedCalls = 0;

    const kept = {
      unsubscribe(): void {
        keptCalls++;
      },
    };
    const removed = {
      unsubscribe(): void {
        removedCalls++;
      },
    };

    subscription.add(kept);
    subscription.add(removed);
    subscription.remove(removed);

    subscription.unsubscribe();
    await subscription.done;

    expect(keptCalls).toBe(1);
    expect(removedCalls).toBe(0);
  });

  it('is idempotent and does not rerun child unsubscribe on repeats', async () => {
    const subscription = new Subscription();
    let calls = 0;

    subscription.add({
      unsubscribe(): void {
        calls++;
      },
    });

    subscription.unsubscribe();
    subscription.unsubscribe();
    await subscription.done;

    expect(calls).toBe(1);
    expect(subscription.closed).toBeTrue();
  });

  it('resolves done on first unsubscribe and remains settled on repeats', async () => {
    const subscription = new Subscription();
    const done = subscription.done;

    subscription.unsubscribe();
    await done;

    subscription.unsubscribe();
    expect(done).resolves.toBeUndefined();
    expect(subscription.done).resolves.toBeUndefined();
  });

  it('attempts all child unsubscribes even when one throws', async () => {
    const subscription = new Subscription();
    let failingCalls = 0;
    let succeedingCalls = 0;

    subscription.add({
      unsubscribe(): void {
        failingCalls++;
        throw new Error('unsubscribe failed');
      },
    });
    subscription.add({
      unsubscribe(): void {
        succeedingCalls++;
      },
    });

    subscription.unsubscribe();
    await subscription.done;

    expect(failingCalls).toBe(1);
    expect(succeedingCalls).toBe(1);
    expect(subscription.closed).toBeTrue();
  });

  it('closes and resolves done for empty subscriptions', async () => {
    const subscription = new Subscription();

    subscription.unsubscribe();
    await subscription.done;

    expect(subscription.closed).toBeTrue();
  });
});
