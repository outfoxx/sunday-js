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

import { AnyType } from '../any-type';
import { TextMediaTypeDecoder } from './media-type-decoder';

export class AnyTextDecoder implements TextMediaTypeDecoder {
  static default = new AnyTextDecoder();

  async decode<T>(response: Response, type: AnyType): Promise<T> {
    if (type[0] != String) {
      throw Error('Invalid type, expected String');
    }
    return (await response.text()) as unknown as T;
  }

  decodeText<T>(text: string, type: AnyType): T {
    if (type[0] != String) {
      throw Error('Invalid type, expected String');
    }
    return text as unknown as T;
  }
}
