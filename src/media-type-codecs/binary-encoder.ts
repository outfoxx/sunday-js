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

import { MediaTypeEncoder } from './media-type-encoder';

export class BinaryEncoder implements MediaTypeEncoder {
  static default = new BinaryEncoder();

  encode(value: unknown): BodyInit {
    if (
      !ArrayBuffer.isView(value) &&
      !(value instanceof ArrayBuffer) &&
      !(value instanceof Blob) &&
      !(value instanceof ReadableStream)
    ) {
      throw Error(
        'Invalid value, expected BufferSource, Blob or ReadableStream'
      );
    }
    return value;
  }
}
