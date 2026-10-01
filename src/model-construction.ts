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

import { ArrayBufferEncoding, DateEncoding, NumericDateDecoding } from './schema-policy.js';
import { createSchemaRuntime, SchemaLike } from './schema-runtime.js';

const runtime = createSchemaRuntime({
  format: 'json',
  dateEncoding: DateEncoding.ISO8601,
  numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
  arrayBufferEncoding: ArrayBufferEncoding.BASE64,
});

// Only the exact constructor called by a synchronous codec may skip an already completed check.
let validatedConstructor: object | undefined;

/** Constructs a model from fields already checked by its native Zod codec. */
export function constructValidatedModel<T, Args extends unknown[]>(
  type: new (...args: Args) => T,
  ...args: Args
): T {
  const previous = validatedConstructor;
  validatedConstructor = type;
  try {
    return new type(...args);
  }
  finally {
    validatedConstructor = previous;
  }
}

/** Checks initialized constructor storage through its canonical response-mode Zod schema. */
export function validateModelConstruction<T>(value: T, schema: SchemaLike<T>, type: object): void {
  if (validatedConstructor !== type) runtime.resolveSchema(schema).encode(value);
}
