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
  DeserializationContext,
  NumericDateDecoding as SerdeNumericDateDecoding,
  Serde,
} from '../serde.js';
import {
  StructuredMediaTypeDecoder,
  TextMediaTypeDecoder,
} from './media-type-decoder.js';

export class JSONDecoder
  implements TextMediaTypeDecoder, StructuredMediaTypeDecoder
{
  static get default(): JSONDecoder {
    return new JSONDecoder(SerdeNumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH);
  }

  constructor(readonly numericDateDecoding: SerdeNumericDateDecoding) {}

  async decode<T>(response: Response, type: Serde<T>): Promise<T> {
    const data = await response.json();
    return this.decodeObject(data, type);
  }

  decodeText<T>(text: string, type: Serde<T>): T {
    const value = JSON.parse(text);
    return this.decodeObject(value, type);
  }

  decodeObject<T>(value: unknown, type: Serde<T>): T {
    const ctx: DeserializationContext = {
      format: 'json',
      numericDateDecoding: this.numericDateDecoding,
    };
    return type.deserialize(value, ctx);
  }
}


export namespace JSONDecoder {
  export const NumericDateDecoding = SerdeNumericDateDecoding;
}
