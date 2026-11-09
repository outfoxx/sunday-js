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

/** A runtime marker shared by separate copies of Sunday in the same JavaScript realm. */
export const requestCancellation = Symbol.for(
  '@outfoxx/sunday/RequestCancellationError',
);

/** An unconditional stop signal. Sunday rethrows the original instance without retry or reconnect. */
export class RequestCancellationError extends Error {
  readonly [requestCancellation] = true;

  constructor(message = 'Request cancelled', options?: ErrorOptions) {
    super(message, options);
    this.name = 'RequestCancellationError';
  }
}

/** Recognizes stop errors, including application errors implementing the exported runtime marker. */
export function isRequestCancellationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    requestCancellation in error &&
    error[requestCancellation] === true
  );
}

/** Native abort errors also stop an invocation; an absent marker never authorizes a retry. */
export function isRequestStopped(error: unknown): boolean {
  return (
    isRequestCancellationError(error) ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'AbortError')
  );
}

/** @internal Caller cancellation takes precedence without inspecting application error causes. */
export function requestFailure(error: unknown, signal?: AbortSignal): unknown {
  return signal?.aborted ? signal.reason : error;
}
