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

import { CBOR } from 'cbor-redux';
import {
  DateEncoding as SchemaDateEncoding,
  SchemaLike, SchemaPolicy,
  SchemaRuntime,
} from '../schema-runtime.js';
import { createCBORSchemaRuntime } from './default-policies.js';
import { MediaTypeEncoder } from './media-type-encoder.js';

export class CBOREncoder implements MediaTypeEncoder {
  static readonly default = new CBOREncoder();

  static fromPolicy(policy: Partial<Omit<SchemaPolicy, 'format'>>): CBOREncoder {
    return new CBOREncoder(createCBORSchemaRuntime(policy));
  }

  constructor(readonly runtime: SchemaRuntime = createCBORSchemaRuntime()) {
  }

  encode<T>(value: T, type?: SchemaLike<T>): ArrayBuffer {
    const serialized = type
      ? this.runtime.resolveSchema(type).encode(value)
      : value;
    return CBOR.encode(pruneNullObjectProperties(serialized));
  }
}

function pruneNullObjectProperties(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
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
  if (isPlainObject(value)) {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source);
    let result: Record<string, unknown> | undefined;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const entry = source[key];
      const next = pruneNullObjectProperties(entry);
      const removed = next === null;
      const changed = removed || next !== entry;

      if (!result && changed) {
        result = {};
        for (let backfill = 0; backfill < index; backfill += 1) {
          const prevKey = keys[backfill];
          result[prevKey] = source[prevKey];
        }
      }

      if (result && !removed) {
        result[key] = next;
      }
    }
    return result ?? value;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export namespace CBOREncoder {
  export const DateEncoding = SchemaDateEncoding;
}
