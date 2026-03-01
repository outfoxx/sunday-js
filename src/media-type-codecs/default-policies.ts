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
  ArrayBufferEncoding,
  createSchemaRuntime,
  NumericDateDecoding,
  DateEncoding,
  SchemaRuntime, SchemaPolicy,
} from '../schema-runtime.js';

export function createJSONSchemaRuntime(options?: Partial<Omit<SchemaPolicy, 'format'>>): SchemaRuntime {
  return createSchemaRuntime(
    {
      format: 'json',
      dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      arrayBufferEncoding: ArrayBufferEncoding.BASE64,
      ...options,
    },
  );
}

export function createCBORSchemaRuntime(options?: Partial<Omit<SchemaPolicy, 'format'>>): SchemaRuntime {
  return createSchemaRuntime(
    {
      format: 'cbor',
      dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      arrayBufferEncoding: ArrayBufferEncoding.RAW_BYTES,
      ...options,
    },
  );
}
