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

export function secondsToNumber(seconds: number, nanos: number): number {
  if (nanos == 0) {
    return seconds;
  }
  return seconds + (nanos / 1e9);
}

/**
 * Encodes seconds and fraction into an array of numbers that matches
 * Jackson's optional second/fraction timestamp fields.
 */
export function encodeNumericArray(seconds: number, fraction: number): number[] {
  const result = [];
  if (seconds != 0 || fraction != 0) {
    result.push(seconds);
    if (fraction != 0) {
      result.push(fraction);
    }
  }
  return result;
}

/**
 * Appends Jackson-style optional second/fraction fields to a required
 * date/time prefix (such as year-month-day-hour-minute).
 */
export function appendNumericTimeFields(
  prefix: number[],
  seconds: number,
  fraction: number,
): number[] {
  return [...prefix, ...encodeNumericArray(seconds, fraction)];
}
