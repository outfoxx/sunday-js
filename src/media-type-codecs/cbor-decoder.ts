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
import { DeserializationContext, NumericDateDecoding as SerdeNumericDateDecoding, Serde } from '../serde.js';
import { MediaTypeDecoder } from './media-type-decoder.js';

export class CBORDecoder implements MediaTypeDecoder {
  static get default(): CBORDecoder {
    return new CBORDecoder(SerdeNumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH);
  }

  constructor(readonly numericDateDecoding: SerdeNumericDateDecoding) {}

  async decode<T>(response: Response, type: Serde<T>): Promise<T> {
    const buffer = await response.arrayBuffer();
    return this.decodeData(buffer, type);
  }

  decodeData<T>(buffer: ArrayBuffer, type: Serde<T>): T {
    const data = CBOR.decode(buffer);
    const ctx: DeserializationContext = {
      format: 'cbor',
      numericDateDecoding: this.numericDateDecoding,
    };
    return type.deserialize(data, ctx);
  }
}


export namespace CBORDecoder {
  export const NumericDateDecoding = SerdeNumericDateDecoding;
}
