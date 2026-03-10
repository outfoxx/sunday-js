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
  DateEncoding as SchemaDateEncoding,
  SchemaLike,
  SchemaPolicy,
  SchemaRuntime,
} from '../schema-runtime.js';
import { pruneNullObjectProperties } from '../util/objects.js';
import { createJSONSchemaRuntime } from './default-policies.js';
import { StructuredMediaTypeEncoder } from './media-type-encoder.js';
import { z } from 'zod';

const JSON_OBJECT_SCHEMA = z.record(z.string(), z.unknown());

export class JSONEncoder implements StructuredMediaTypeEncoder {
  static readonly default = new JSONEncoder();

  static fromPolicy(policy: Partial<Omit<SchemaPolicy, 'format'>>): JSONEncoder {
    return new JSONEncoder(createJSONSchemaRuntime(policy));
  }

  constructor(readonly runtime: SchemaRuntime = createJSONSchemaRuntime()) {
  }

  encode<T>(value: T, type?: SchemaLike<T>, includeNulls?: boolean): string {
    const serialized = type
      ? this.runtime.resolveSchema(type).encode(value)
      : value;
    const output = includeNulls ? serialized : pruneNullObjectProperties(serialized);
    return JSON.stringify(output);
  }

  encodeObject<T>(
    value: T,
    type?: SchemaLike<T>,
    includeNulls = false,
  ): Record<string, unknown> {
    const serialized = type
      ? this.runtime.resolveSchema(type).encode(value)
      : value;
    const output = includeNulls ? serialized : pruneNullObjectProperties(serialized);
    return JSON_OBJECT_SCHEMA.parse(output);
  }
}

export namespace JSONEncoder {
  export const DateEncoding = SchemaDateEncoding;
}
