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
  NumericDateDecoding as SchemaNumericDateDecoding,
  SchemaLike,
  SchemaPolicy,
  SchemaRuntime,
} from '../schema-runtime.js';
import { createJSONSchemaRuntime } from './default-policies.js';
import {
  StructuredMediaTypeDecoder,
  TextMediaTypeDecoder,
} from './media-type-decoder.js';

export class JSONDecoder
  implements TextMediaTypeDecoder, StructuredMediaTypeDecoder
{
  static readonly default = new JSONDecoder();

  static fromPolicy(policy: Partial<Omit<SchemaPolicy, 'format'>>): JSONDecoder {
    return new JSONDecoder(createJSONSchemaRuntime(policy));
  }

  constructor(readonly runtime: SchemaRuntime = createJSONSchemaRuntime()) {
  }

  async decode<T>(response: Response, type: SchemaLike<T>): Promise<T> {
    const data = await response.json();
    return this.decodeObject(data, type);
  }

  decodeText<T>(text: string, type: SchemaLike<T>): T {
    const value = JSON.parse(text);
    return this.decodeObject(value, type);
  }

  decodeObject<T>(value: unknown, type: SchemaLike<T>): T {
    return this.runtime.resolveSchema(type).decode(value);
  }
}

export namespace JSONDecoder {
  export const NumericDateDecoding = SchemaNumericDateDecoding;
}
