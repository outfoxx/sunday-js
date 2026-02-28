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

import { DeserializationContext, NumericDateDecoding, Serde } from '../serde.js';
import { MediaTypeDecoder } from './media-type-decoder.js';

export class BinaryDecoder implements MediaTypeDecoder {
  static default = new BinaryDecoder();

  async decode<T>(response: Response, type: Serde<T>): Promise<T> {
    const arrayBuffer = await response.arrayBuffer();
    const ctx: DeserializationContext = {
      format: 'cbor',
      numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
    };
    return type.deserialize(arrayBuffer, ctx);
  }
}

