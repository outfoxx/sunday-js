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

import { OffsetDateTime } from '@js-joda/core';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { createSchemaRuntime, defineModelSchema, SchemaLike, SchemaPolicy, withModelConstraints } from '../src';

const runtime = createSchemaRuntime({ format: 'json' } as SchemaPolicy);

describe('generated model cycle validation', () => {
  interface Node { value: string; children: Node[] }
  const NodeSchema: SchemaLike<Node> = defineModelSchema(runtime => z.object({
    value: z.string().min(1),
    children: z.array(z.lazy(() => runtime.resolveSchema(NodeSchema))),
  }));

  it('rejects cycles with a native path and allows shared references on every invocation', () => {
    const schema = runtime.resolveSchema(NodeSchema);
    const leaf: Node = { value: 'leaf', children: [] };
    const root: Node = { value: 'root', children: [leaf, leaf] };
    expect(schema.safeParse(root).success).toBe(true);
    expect(schema.safeEncode(root).success).toBe(true);
    leaf.children.push(root);
    for (const result of [schema.safeParse(root), schema.safeEncode(root)]) {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]).toMatchObject({
          code: 'custom', path: ['children', 0, 'children', 0], params: { reason: 'cycle' },
        });
      }
    }
    leaf.children.length = 0;
    expect(schema.safeEncode(root).success).toBe(true);
    leaf.value = '';
    expect(schema.safeEncode(root).success).toBe(false);
  });

  it('ignores discarded fields but checks retained untyped payloads', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const stripped = runtime.resolveSchema(defineModelSchema(() => z.object({ value: z.string() })));
    expect(stripped.parse({ value: 'ok', cycle })).toEqual({ value: 'ok' });
    const retained = runtime.resolveSchema(defineModelSchema(() => z.looseObject({ value: z.string() })));
    for (const result of [retained.safeParse({ value: 'ok', cycle }), retained.safeEncode({ value: 'ok', cycle })]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['cycle', 'self']);
    }
  });

  it('treats native temporal values as scalars while checking their surrounding model graph', () => {
    const timestamp = OffsetDateTime.parse('2026-09-30T00:00:00Z');
    const schema = runtime.resolveSchema(defineModelSchema(() => z.object({
      timestamp: z.custom<OffsetDateTime>(value => value instanceof OffsetDateTime),
      extra: z.unknown().optional(),
    })));
    expect(schema.parse({ timestamp }).timestamp).toBe(timestamp);
    expect(schema.encode({ timestamp }).timestamp).toBe(timestamp);
    const cycle: Record<string, unknown> = { timestamp };
    cycle.self = cycle;
    expect(schema.safeParse({ timestamp, extra: cycle }).success).toBe(false);
  });

  it('does not confuse aliases with cycles or repeat native predicates', () => {
    let calls = 0;
    const child = defineModelSchema(() => z.object({ value: z.string().refine(() => { calls++; return true; }) }));
    const alias = defineModelSchema(runtime => runtime.resolveSchema(child));
    const schema = runtime.resolveSchema(alias);
    expect(schema.parse({ value: 'ok' })).toEqual({ value: 'ok' });
    expect(calls).toBe(1);
    expect(schema.encode({ value: 'ok' })).toEqual({ value: 'ok' });
    expect(calls).toBe(2);
  });
});


describe('union common assertions', () => {
  it('checks common tag constraints without replacing a reused discriminator enum', () => {
    class Tag { constructor(public readonly rawValue: string) {} }
    const tag = z.codec(z.string(), z.instanceof(Tag), {
      decode: value => new Tag(value), encode: value => value.rawValue,
    });
    const payload = z.object({ kind: tag, value: z.number() });
    const common = z.object({ kind: z.string().min(3), value: z.number().max(5) });
    const union = withModelConstraints(payload, common, 'kind');
    const value = union.parse({ kind: 'known', value: 2 });
    const identity = value.kind;
    expect(union.encode(value)).toEqual({ kind: 'known', value: 2 });
    expect(value.kind).toBe(identity);
    const invalid = { kind: new Tag('x'), value: 2 };
    expect(payload.safeEncode(invalid).success).toBe(true);
    for (const result of [union.safeEncode(invalid), union.safeParse({ kind: 'x', value: 2 })]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['kind']);
    }
    expect(invalid.kind.rawValue).toBe('x');
  });

  it('checks both directions once, preserves payload identity, and rechecks mutations', () => {
    class Payload { constructor(public value: number) {} }
    let commonCalls = 0;
    let payloadCalls = 0;
    const payload = z.codec(z.object({ value: z.number() }), z.instanceof(Payload), {
      decode: value => { payloadCalls++; return new Payload(value.value); },
      encode: value => { payloadCalls++; return { value: value.value }; },
    });
    const branches = z.union([payload, z.object({ other: z.string() })]);
    const common = z.object({ value: z.number().max(5) }).refine(() => { commonCalls++; return true; });
    const union = withModelConstraints(branches, common);
    const value = union.parse({ value: 2 });
    expect(value).toBeInstanceOf(Payload);
    expect(commonCalls).toBe(1);
    expect(payloadCalls).toBe(1);
    expect(union.encode(value)).toEqual({ value: 2 });
    expect(commonCalls).toBe(2);
    expect(payloadCalls).toBe(2);
    (value as Payload).value = 9;
    expect(payload.safeEncode(value as Payload).success).toBe(true);
    for (const result of [union.safeEncode(value), union.safeParse({ value: 9 })]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['value']);
    }
    expect((value as Payload).value).toBe(9);
  });
});
