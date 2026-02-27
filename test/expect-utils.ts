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

import {expect} from 'bun:test';

type Normalizable =
  | null
  | undefined
  | string
  | number
  | boolean
  | bigint
  | symbol
  | object;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
};

const normalize = (value: Normalizable): unknown => {
  if (value instanceof URL) {
    return value.toString();
  }
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalize(entry as Normalizable);
    }
    return normalized;
  }
  return value;
};

export const expectEqual = (actual: unknown, expected: unknown): void => {
  expect(normalize(actual as Normalizable)).toEqual(
    normalize(expected as Normalizable),
  );
};
