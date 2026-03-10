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

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function pruneNullObjectProperties(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return pruneNullArray(value);
  }
  if (isPlainObject(value)) {
    return pruneNullObject(value);
  }
  return value;
}

function pruneNullObject(value: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(value);
  let result: Record<string, unknown> | undefined;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const entry = value[key];
    const next = pruneNullObjectProperties(entry);
    const removed = next === null;
    const changed = removed || next !== entry;

    if (!result && changed) {
      result = {};
      for (let backfill = 0; backfill < index; backfill += 1) {
        const prevKey = keys[backfill];
        result[prevKey] = value[prevKey];
      }
    }

    if (result && !removed) {
      result[key] = next;
    }
  }
  return result ?? value;
}

function pruneNullArray(value: Array<unknown>): Array<unknown> {
  let result: Array<unknown> | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const next = pruneNullObjectProperties(entry);
    if (!result && next !== entry) {
      result = value.slice(0, index);
    }
    if (result) {
      result.push(next);
    }
  }
  return result ?? value;
}
