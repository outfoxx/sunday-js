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

import { Instant, LocalDate, LocalDateTime, LocalTime, OffsetDateTime, ZonedDateTime } from '@js-joda/core';
import { z } from 'zod';
import { defineSchema, SchemaDef, SchemaRuntime } from './schema-runtime.js';

// Generated schemas and their transformations are synchronous. A root invocation owns the
// untyped-payload cycle check; nested schemas protect only their own recursive entry points.
let invocationDepth = 0;

/** Defines a generated synchronous model codec with native Zod cycle diagnostics in both directions. */
export function defineModelSchema<Output, Input = unknown>(
  build: (runtime: SchemaRuntime) => z.ZodType<Output, Input>,
  options?: { id?: symbol; debugName?: string },
): SchemaDef<z.ZodType<Output, Input>> {
  return defineSchema((runtime) => {
    const schema = build(runtime);
    const ancestors = new WeakSet<object>();
    function evaluate(
      value: unknown,
      context: z.core.ParsePayload,
      direction: 'decode' | 'encode',
    ): unknown {
      const object = typeof value === 'object' && value !== null ? value : undefined;
      if (object && ancestors.has(object)) {
        context.issues.push(cycleIssue([]));
        return z.NEVER;
      }
      if (object) ancestors.add(object);
      const root = invocationDepth++ === 0;
      try {
        const result = direction === 'decode' ? schema.safeParse(value) : schema.safeEncode(value as Output);
        if (!result.success) {
          context.issues.push(...result.error.issues.map(issue => ({ ...issue, input: undefined })));
          return z.NEVER;
        }
        // Native object parsing has already removed non-participating fields. Inspecting its result
        // also covers raw extension payloads without rejecting discarded input or invoking constructors.
        const path = root ? cyclePath(result.data) : undefined;
        if (path) {
          context.issues.push(cycleIssue(path));
          return z.NEVER;
        }
        return result.data;
      }
      finally {
        invocationDepth--;
        if (object) ancestors.delete(object);
      }
    }
    return z.codec(z.custom<Input>(), z.custom<Output>(), {
      decode: (value, context) => evaluate(value, context, 'decode') as Output,
      encode: (value, context) => evaluate(value, context, 'encode') as Input,
    });
  }, options);
}

/** Applies common native schema assertions without replacing a reusable union's payload type. */
export function withModelConstraints<Output, Input>(
  payload: z.ZodType<Output, Input>,
  common: z.ZodType,
  discriminator?: string,
): z.ZodType<Output, Input> {
  function evaluate(value: unknown, context: z.core.ParsePayload, direction: 'decode' | 'encode'): unknown {
    let fields = value;
    if (direction === 'encode' && discriminator && typeof value === 'object' && value !== null && discriminator in value) {
      const tag: unknown = (value as Record<string, unknown>)[discriminator];
      if (typeof tag === 'object' && tag !== null && 'rawValue' in tag && typeof tag.rawValue === 'string') {
        // Reused payload enums may have another nominal type; common tag rules inspect their wire value.
        fields = { ...value, [discriminator]: tag.rawValue };
      }
    }
    const constraints = direction === 'decode' ? common.safeParse(fields) : common.safeEncode(fields);
    if (!constraints.success) {
      context.issues.push(...constraints.error.issues.map(issue => ({ ...issue, input: undefined })));
      return z.NEVER;
    }
    // Keep the selected payload's native conversion and identity. The common schema is assertion-only.
    const result = direction === 'decode' ? payload.safeParse(value) : payload.safeEncode(value as Output);
    if (!result.success) {
      context.issues.push(...result.error.issues.map(issue => ({ ...issue, input: undefined })));
      return z.NEVER;
    }
    return result.data;
  }
  // A refinement attached directly to a union loses its issues during Zod's reverse union pass.
  return z.codec(z.custom<Input>(), z.custom<Output>(), {
    decode: (value, context) => evaluate(value, context, 'decode') as Output,
    encode: (value, context) => evaluate(value, context, 'encode') as Input,
  });
}

function cycleIssue(path: PropertyKey[]): z.core.$ZodRawIssue {
  return { code: 'custom', input: undefined, message: 'Object cycles cannot be serialized', path, params: { reason: 'cycle' } };
}

function cyclePath(value: unknown): PropertyKey[] | undefined {
  const ancestors = new WeakSet<object>();
  const pending: { value: unknown; path: PropertyKey[]; leave?: boolean }[] = [{ value, path: [] }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (typeof entry.value !== 'object' || entry.value === null) continue;
    // Temporal codecs serialize these native values as scalars, not their cyclic zone-rule internals.
    if (entry.value instanceof Instant || entry.value instanceof LocalDate ||
        entry.value instanceof LocalDateTime || entry.value instanceof LocalTime ||
        entry.value instanceof OffsetDateTime || entry.value instanceof ZonedDateTime) continue;
    if (entry.leave) {
      ancestors.delete(entry.value);
      continue;
    }
    if (ancestors.has(entry.value)) return entry.path;
    ancestors.add(entry.value);
    pending.push({ ...entry, leave: true });
    const children = modelChildren(entry.value);
    for (let index = children.length - 1; index >= 0; index--) {
      const [key, item] = children[index];
      pending.push({ value: item, path: [...entry.path, key] });
    }
  }
  return undefined;
}

function modelChildren(value: object): [PropertyKey, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [index, item]);
  if (value instanceof Map) return [...value].flatMap(([key, item], index) => [[`key:${index}`, key], [String(key), item]]);
  if (value instanceof Set) return [...value].map((item, index) => [index, item]);
  return Object.entries(value);
}
