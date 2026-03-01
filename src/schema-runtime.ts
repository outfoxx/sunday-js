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

import { z } from 'zod';
import {
  SchemaPolicy,
} from './schema-policy.js';

export {
  ArrayBufferEncoding,
  DateEncoding,
  NumericDateDecoding,
} from './schema-policy.js';
export type {
  SchemaFormat,
  SchemaPolicy,
} from './schema-policy.js';

export const SchemaDefType: unique symbol = Symbol('SchemaDefType');

export type AnySchema = z.ZodType;

export type SchemaDef<S extends AnySchema = AnySchema> = {
  readonly id: symbol;
  readonly build: (runtime: SchemaRuntime) => S;
  readonly debugName?: string;
  readonly [SchemaDefType]: true;
};

export type SchemaLike<T = unknown> = z.ZodType<T> | SchemaDef<z.ZodType<T>>;

export type ResolvedSchema<S> =
  S extends SchemaDef<infer TSchema> ? TSchema : S;

export function isSchema(value: unknown): value is z.ZodType {
  const rec = value as Record<string, unknown>;
  return !!value
    && typeof value === 'object'
    && (typeof rec.safeParse === 'function' || typeof rec.safeDecode === 'function');
}

export function isSchemaDef(value: unknown): value is SchemaDef {
  const rec = value as Record<PropertyKey, unknown>;
  return !!value
    && typeof value === 'object'
    && rec[SchemaDefType] === true
    && typeof rec.id === 'symbol'
    && typeof rec.build === 'function';
}

export function defineSchema<S extends AnySchema>(
  builder: (runtime: SchemaRuntime) => S,
  options?: { id?: symbol; debugName?: string },
): SchemaDef<S> {
  return {
    id: options?.id ?? Symbol(options?.debugName),
    build: builder,
    debugName: options?.debugName,
    [SchemaDefType]: true,
  };
}

export interface SchemaRuntime {
  readonly policy: SchemaPolicy;

  resolveSchema<S extends SchemaLike>(ref: S): ResolvedSchema<S>;
}

class DefaultSchemaRuntime implements SchemaRuntime {
  private schemas = new Map<symbol, AnySchema>();
  private resolving = new Set<symbol>();

  constructor(readonly policy: SchemaPolicy) {}

  resolveSchema<S extends SchemaLike>(ref: S): ResolvedSchema<S> {
    if (isSchema(ref)) {
      return ref as ResolvedSchema<S>;
    }

    if (!isSchemaDef(ref)) {
      throw new Error('Schema definition failed to resolve; expected a zod schema or SchemaDef');
    }

    const found = this.schemas.get(ref.id);
    if (found) {
      return found as ResolvedSchema<S>;
    }

    if (this.resolving.has(ref.id)) {
      throw new Error('Recursive schema definition invocation detected; use z.lazy(...) for recursive models');
    }

    this.resolving.add(ref.id);
    try {
      const schema = ref.build(this);
      if (!isSchema(schema)) {
        const definition = ref.debugName ? ` '${ref.debugName}'` : '';
        throw new Error(`Schema definition failed to resolve${definition}; builder must return a zod schema`);
      }
      this.schemas.set(ref.id, schema);
      return schema as ResolvedSchema<S>;
    }
    finally {
      this.resolving.delete(ref.id);
    }
  }
}

export function createSchemaRuntime(policy: SchemaPolicy): SchemaRuntime {
  return new DefaultSchemaRuntime(policy);
}
