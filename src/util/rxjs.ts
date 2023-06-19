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

import {
  catchError,
  firstValueFrom,
  from,
  fromEvent,
  Observable,
  switchMap,
  take,
  takeUntil,
  throwError,
} from 'rxjs';
import { createErrorClass } from 'rxjs/internal/util/createErrorClass';
import { ClassType } from '../class-type';
import { Problem } from '../problem';

export function nullifyNotFound<T>(): (
  source: Observable<T>,
) => Observable<T | null> {
  return nullifyResponse([404], []);
}

export function nullifyResponse<T>(
  statuses: number[],
  problemTypes: ClassType<Problem>[],
): (source: Observable<T>) => Observable<T | null> {
  return function <T>(source: Observable<T>): Observable<T | null> {
    return source.pipe(
      catchError((error) => {
        const errorType = error.constructor as ClassType<Problem>;
        if (
          error instanceof Problem &&
          (statuses.includes(error.status) || problemTypes.includes(errorType))
        ) {
          return from([null]);
        }
        return throwError(() => error);
      }),
    );
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AbortError extends Error {}

export type AbortErrorCtor = new () => AbortError;

/**
 * An error thrown when an Observable converted to a promise is aborted with
 * via a provided `AbortSignal`.
 *
 * @see {@link promiseFrom}
 *
 * @class AbortError
 */
export const AbortError: AbortErrorCtor = createErrorClass(
  (_super: (instance: Error) => void) =>
    function AbortErrorImpl(this: Error) {
      _super(this);
      this.name = 'AbortError';
      this.message = 'sequence was aborted';
    },
);

/**
 * Converts an Observable to a Promise, optionally aborting the Observable via
 * a provided `AbortSignal`.
 *
 * @param obs Observable to convert to a Promise
 * @param signal Optional AbortSignal to abort the Observable
 * @returns Promise that resolves to the first value from the Observable
 */
export function promiseFrom<T>(
  obs: Observable<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) {
    return firstValueFrom(obs);
  }
  // Reject immediately if the signal has already fired. Use `AbortError`
  // because that's what `first` will fail with per the note below
  if (signal.aborted) {
    return Promise.reject(new AbortError());
  }

  const stop = fromEvent(signal, 'abort').pipe(
    take(1),
    switchMap(() => throwError(() => new AbortError())),
  );

  // Note that `takeUntil` will cause the observable to complete when the
  // Signal fires, but `firstValueFrom` will fail with EmptyError if there
  // wasn't a value, which will reject out of the returned Promise.
  return firstValueFrom(obs.pipe(takeUntil(stop)));
}
