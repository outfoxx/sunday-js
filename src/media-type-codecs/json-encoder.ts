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
  DateEncoding as SerdeDateEncoding,
  expectObject,
  SerializationContext,
  Serde,
} from '../serde.js';
import { StructuredMediaTypeEncoder } from './media-type-encoder.js';

export class JSONEncoder implements StructuredMediaTypeEncoder {
  static get default(): JSONEncoder {
    return new JSONEncoder(SerdeDateEncoding.DECIMAL_SECONDS_SINCE_EPOCH);
  }

  constructor(readonly dateEncoding: SerdeDateEncoding) {}

  encode<T>(value: T, type?: Serde<T>, includeNulls = false): string {
    const ctx: SerializationContext = {
      format: 'json',
      dateEncoding: this.dateEncoding,
      includeNulls,
    };
    const serialized = type ? type.serialize(value, ctx) : value;
    return JSON.stringify(serialized);
  }

  encodeObject<T>(
    value: T,
    type?: Serde<T>,
    includeNulls = false,
  ): Record<string, unknown> {
    const ctx: SerializationContext = {
      format: 'json',
      dateEncoding: this.dateEncoding,
      includeNulls,
    };
    const serialized = type ? type.serialize(value, ctx) : value;
    return expectObject(serialized, 'JSON');
  }
}


export namespace JSONEncoder {
  export const DateEncoding = SerdeDateEncoding;
}
