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

import { MediaTypeDecoder } from './media-type-decoder';
import { AnyConstructableType } from '../any-type';

export class BinaryDecoder implements MediaTypeDecoder {
  static default = new BinaryDecoder();

  async decode<T>(response: Response, type: AnyConstructableType): Promise<T> {
    const arrayBuffer = await response.arrayBuffer();

    if (type[0] === ArrayBuffer) {
      return arrayBuffer as unknown as T;
    } else if (
      type[0] === Uint8Array ||
      type[0] === Int8Array ||
      type[0] === DataView
    ) {
      return new type[0](arrayBuffer) as T;
    }

    throw Error(
      'Invalid value, expected ArrayBuffer, (Int|Uint)Array or DataView',
    );
  }
}
