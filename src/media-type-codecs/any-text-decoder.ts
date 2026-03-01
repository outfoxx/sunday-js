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

import { TextMediaTypeDecoder } from './media-type-decoder.js';
import { isSchema, SchemaLike } from '../schema-runtime.js';

export class AnyTextDecoder implements TextMediaTypeDecoder {
  static default = new AnyTextDecoder();

  async decode<T>(response: Response, type: SchemaLike<T>): Promise<T> {
    return this.decodeText(await response.text(), type);
  }

  decodeText<T>(text: string, schema: SchemaLike<T>): T {
    if (isSchema(schema)) {
      return schema.parse(text);
    } else {
      throw new Error(`Unsupported schema type: ${typeof schema}`);
    }
  }
}
