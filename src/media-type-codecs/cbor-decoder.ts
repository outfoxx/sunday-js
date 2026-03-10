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
  NumericDateDecoding as SchemaNumericDateDecoding,
  SchemaLike, SchemaPolicy,
  SchemaRuntime,
} from '../schema-runtime.js';
import { createCBORSchemaRuntime } from './default-policies.js';
import { BufferMediaTypeDecoder } from './media-type-decoder.js';

export class CBORDecoder implements BufferMediaTypeDecoder {
  static readonly default = new CBORDecoder();

  static fromPolicy(policy: Partial<Omit<SchemaPolicy, 'format'>>): CBORDecoder {
    return new CBORDecoder(createCBORSchemaRuntime(policy));
  }

  constructor(readonly runtime: SchemaRuntime = createCBORSchemaRuntime()) {
  }

  async decode<T>(response: Response, type: SchemaLike<T>): Promise<T> {
    const buffer = await response.arrayBuffer();
    return this.decodeBuffer(buffer, type);
  }

  decodeBuffer<T>(buffer: ArrayBuffer, type: SchemaLike<T>): T {
    const data = CBOR.decode(buffer);
    return this.runtime.resolveSchema(type).decode(data);
  }
}

export namespace CBORDecoder {
  export const NumericDateDecoding = SchemaNumericDateDecoding;
}
