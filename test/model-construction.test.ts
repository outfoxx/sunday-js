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

import { expect, it } from 'bun:test';
import { z } from 'zod';
import {
  constructValidatedModel, createSchemaRuntime, defineModelSchema, SchemaLike, SchemaPolicy, validateModelConstruction,
} from '../src';

it('constructors and codecs use the same native schema without duplicate predicates', () => {
  let calls = 0;
  class Model {
    value: string;
    constructor(init: { value: string }) {
      this.value = init.value;
      validateModelConstruction(this, schema, Model);
    }
  }
  const schema: SchemaLike<Model> = defineModelSchema(() => z.codec(
    z.object({ 'wire-value': z.string().refine(value => { calls++; return value.length >= 2; }) }),
    z.instanceof(Model),
    {
      decode: value => constructValidatedModel(Model, { value: value['wire-value'] }),
      encode: value => ({ 'wire-value': value.value }),
    },
  ));
  const runtime = createSchemaRuntime({ format: 'json' } as SchemaPolicy);
  const model = new Model({ value: 'ok' });
  expect(calls).toBe(1);
  expect(() => new Model({ value: 'x' })).toThrow(z.ZodError);
  expect(calls).toBe(2);
  const decoded = runtime.resolveSchema(schema).parse({ 'wire-value': 'ok' });
  expect(decoded).toBeInstanceOf(Model);
  expect(calls).toBe(3);
  expect(runtime.resolveSchema(schema).encode(model)).toEqual({ 'wire-value': 'ok' });
  expect(calls).toBe(4);
  model.value = 'x';
  const result = runtime.resolveSchema(schema).safeEncode(model);
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues[0].path).toEqual(['wire-value']);
  expect(calls).toBe(5);
});

it('construction suppression is scoped to one exact constructor and restored after failures', () => {
  let calls = 0;
  const schema = z.string().refine(() => { calls++; return false; });
  class Other {
    constructor() { validateModelConstruction('value', schema, Other); }
  }
  class Model {
    constructor() {
      validateModelConstruction('value', schema, Model);
      new Other();
    }
  }
  expect(() => constructValidatedModel(Model)).toThrow(z.ZodError);
  expect(calls).toBe(1);
  expect(() => new Model()).toThrow(z.ZodError);
  expect(calls).toBe(2);
});
