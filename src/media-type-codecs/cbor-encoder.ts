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
    return CBOR.encode(serialized);
  }
}

export namespace CBOREncoder {
  export const DateEncoding = SchemaDateEncoding;
}
