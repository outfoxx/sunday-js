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

export { discardBody } from './owned-body.js';

/** Waits cooperatively without leaving abort listeners or late resource results behind. */
export function withAbort<T>(
  action: () => T | PromiseLike<T>,
  signal: AbortSignal,
  discard?: (value: T, reason: unknown) => void,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return action();
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          if (aborted) discard?.(value, signal.reason);
          else resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
  });
}
