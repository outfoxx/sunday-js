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

import { expect, it } from 'bun:test';
import {
  discardBody,
  nativeBodyOperation,
  ownBody,
} from '../src/util/owned-body';
import { RequestCancellationError } from '../src/request-cancellation-error';

it('settles an uncooperative native read with its owner failure', async () => {
  const abort = new AbortController();
  const reason = new RequestCancellationError('owner stopped');
  let cancelled: unknown;
  let started = false;
  const body = ownBody(
    new ReadableStream<Uint8Array>({
      cancel(value) {
        cancelled = value;
      },
    }),
    abort.signal,
  );
  const result = nativeBodyOperation(body, () => {
    started = true;
    return new Promise(() => {});
  });
  expect(started).toBe(true);
  abort.abort(reason);
  expect(await result.catch((error) => error)).toBe(reason);
  expect(cancelled).toBe(reason);
});

it('observes native rejection when the owner stops before the abort callback starts', async () => {
  const abort = new AbortController();
  const reason = new RequestCancellationError('owner stopped');
  const body = ownBody(new ReadableStream<Uint8Array>(), abort.signal);
  const result = nativeBodyOperation(body, () =>
    Promise.reject(new Error('native failure')),
  );
  abort.abort(reason);
  expect(await result.catch((error) => error)).toBe(reason);
  await new Promise((resolve) => setTimeout(resolve, 0));
});

for (const cleanup of ['throw', 'reject', 'pending']) {
  it(`starts native cancellation immediately without waiting for ${cleanup} cleanup`, async () => {
    const response = new Response(new ReadableStream<Uint8Array>());
    const reason = new RequestCancellationError('operation stopped');
    const cleanupError = new Error('cleanup failed');
    let received: unknown;
    response.body!.cancel = (value): Promise<void> => {
      received = value;
      if (cleanup === 'throw') throw cleanupError;
      if (cleanup === 'reject') return Promise.reject(cleanupError);
      return new Promise(() => {});
    };
    discardBody(response, reason);
    expect(received).toBe(reason);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
