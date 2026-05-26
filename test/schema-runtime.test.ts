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

import { describe, expect, it } from 'bun:test';
import { TaggedValue } from 'cbor-redux';
import { z } from 'zod';
import {
  ArrayBufferEncoding,
  ArrayBufferSchema,
  createSchemaRuntime,
  DateEncoding,
  DateSchema,
  DurationSchema,
  defineSchema,
  InstantSchema,
  NumericDateDecoding,
  SchemaDef,
  SchemaInput,
  SchemaLike,
  SchemaOutput,
  SchemaPolicy,
  URLSchema,
} from '../src';

const jsonPolicy: SchemaPolicy = {
  format: 'json',
  dateEncoding: DateEncoding.ISO8601,
  numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
  arrayBufferEncoding: ArrayBufferEncoding.BASE64,
};

const cborPolicy: SchemaPolicy = {
  format: 'cbor',
  dateEncoding: DateEncoding.ISO8601,
  numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
  arrayBufferEncoding: ArrayBufferEncoding.RAW_BYTES,
};

describe('SchemaRuntime', () => {
  it('resolves schema definitions on demand and caches by runtime', () => {
    class TestModel {
      constructor(readonly value: string) {}
    }

    let buildCount = 0;
    const TestModelSchema: SchemaLike<TestModel> = defineSchema(
      () => {
        buildCount += 1;
        const testModelWireSchema = z.object({ value: z.string() });
        return z.codec(z.unknown(), z.instanceof(TestModel), {
          decode: (input) => new TestModel(testModelWireSchema.parse(input).value),
          encode: (value) => ({ value: value.value }),
        });
      },
      { debugName: 'TestModelSchema' },
    );

    const runtime = createSchemaRuntime(jsonPolicy);

    const schema1 = runtime.resolveSchema(TestModelSchema);
    const schema2 = runtime.resolveSchema(TestModelSchema);
    expect(schema1).toBe(schema2);
    expect(buildCount).toBe(1);

    const decoded = schema1.decode({ value: 'test' });
    expect(decoded).toBeInstanceOf(TestModel);
    expect(decoded.value).toBe('test');
    expect(schema1.encode(decoded)).toEqual({ value: 'test' });
  });

  it('passes through direct zod schemas', () => {
    const schema = z.object({ value: z.string() });
    const runtime = createSchemaRuntime(jsonPolicy);
    expect(runtime.resolveSchema(schema)).toBe(schema);

    expect(schema.decode({ value: 'a' })).toEqual({ value: 'a' });
    expect(schema.encode({ value: 'b' })).toEqual({ value: 'b' });
    expect(() => schema.decode({ value: 1 } as unknown as { value: string })).toThrow();
    expect(() =>
      schema.encode({ value: 1 } as unknown as { value: string }),
    ).toThrow();
  });

  it('fails to encode with one-way transform schemas', () => {
    const schema = z.string().transform((value) => value.length);
    expect(() => schema.encode(12)).toThrow();
  });

  it('honors per-runtime policy for built-in Date encoding', () => {
    const value = new Date('2001-02-03T04:05:06.789Z');

    const jsonEncoded = createSchemaRuntime(jsonPolicy).resolveSchema(DateSchema).encode(value);
    expect(jsonEncoded).toBe('2001-02-03T04:05:06.789Z');

    const cborEncoded = createSchemaRuntime(cborPolicy).resolveSchema(DateSchema).encode(value);
    expect(cborEncoded).toBeInstanceOf(TaggedValue);
    expect((cborEncoded as TaggedValue).tag).toBe(0);
    expect((cborEncoded as TaggedValue).value).toBe('2001-02-03T04:05:06.789Z');
  });

  it('honors per-runtime policy for built-in ArrayBuffer encoding', () => {
    const bytes = new TextEncoder().encode('hello').buffer;

    const jsonEncoded = createSchemaRuntime(jsonPolicy).resolveSchema(ArrayBufferSchema).encode(bytes);
    expect(jsonEncoded).toBe('aGVsbG8');

    const cborEncoded = createSchemaRuntime(cborPolicy).resolveSchema(ArrayBufferSchema).encode(bytes);
    expect(cborEncoded).toBeInstanceOf(ArrayBuffer);
  });

  it('reuses built-in schemas for identical runtime policies', () => {
    const first = createSchemaRuntime(jsonPolicy);
    const second = createSchemaRuntime(jsonPolicy);
    expect(first.resolveSchema(DateSchema)).toBe(second.resolveSchema(DateSchema));
    expect(first.resolveSchema(DurationSchema)).toBe(second.resolveSchema(DurationSchema));
    expect(first.resolveSchema(InstantSchema)).toBe(second.resolveSchema(InstantSchema));
    expect(first.resolveSchema(URLSchema)).toBe(second.resolveSchema(URLSchema));
    expect(first.resolveSchema(ArrayBufferSchema)).toBe(second.resolveSchema(ArrayBufferSchema));
  });

  it('throws a recursion guard error for immediate self-resolution', () => {
    const recursiveSchema: SchemaLike<unknown> = defineSchema(
      (runtime) => {
        runtime.resolveSchema(recursiveSchema);
        return z.unknown();
      },
      { debugName: 'recursive-immediate' },
    );

    const runtime = createSchemaRuntime(jsonPolicy);
    expect(() => runtime.resolveSchema(recursiveSchema)).toThrow(
      /Recursive schema definition invocation detected/u,
    );
    expect(() => runtime.resolveSchema(recursiveSchema)).toThrow(/z\.lazy/u);
  });

  it('supports recursive definitions via z.lazy', () => {
    type Node = {
      value: string;
      child?: Node;
    };

    const NodeSchema: SchemaLike<Node> = defineSchema(
      (runtime) =>
        z.object({
          value: z.string(),
          child: z.lazy(() => runtime.resolveSchema(NodeSchema)).optional(),
        }) as z.ZodType<Node>,
      { debugName: 'NodeSchema' },
    );

    const runtime = createSchemaRuntime(jsonPolicy);
    const schema = runtime.resolveSchema(NodeSchema);
    const decoded = schema.decode({
      value: 'root',
      child: { value: 'leaf' },
    });
    expect(decoded).toEqual({
      value: 'root',
      child: { value: 'leaf' },
    });
    expect(schema.encode(decoded)).toEqual({
      value: 'root',
      child: { value: 'leaf' },
    });
  });

  it('derives decoded and wire types from schema definitions', () => {
    const StringDateSchema = z.codec(z.string(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    });

    const EventSchema = defineSchema(
      () =>
        z.object({
          id: z.string(),
          occurredAt: StringDateSchema,
        }),
      { debugName: 'EventSchema' },
    );

    type Event = SchemaOutput<typeof EventSchema>;
    type EventWire = SchemaInput<typeof EventSchema>;

    const decodedValue: Event = {
      id: 'event-1',
      occurredAt: new Date('2024-01-02T03:04:05.000Z'),
    };
    const wireValue: EventWire = {
      id: 'event-1',
      occurredAt: '2024-01-02T03:04:05.000Z',
    };

    // @ts-expect-error decoded values use Date, not the wire string.
    const _invalidDecodedValue: Event = wireValue;
    // @ts-expect-error wire values use string, not the decoded Date.
    const _invalidWireValue: EventWire = decodedValue;

    const schema = createSchemaRuntime(jsonPolicy).resolveSchema(EventSchema);

    expect(schema.decode(wireValue)).toEqual(decodedValue);
    expect(schema.encode(decodedValue)).toEqual(wireValue);
  });

  it('supports zod-style schema values and model types with the same name', () => {
    const SomeType = defineSchema(
      () =>
        z.object({
          id: z.string(),
          count: z.number(),
        }),
      { debugName: 'SomeType' },
    );
    type SomeType = SchemaOutput<typeof SomeType>;

    const decodedValue: SomeType = {
      id: 'some-id',
      count: 3,
    };

    const _invalidDecodedValue: SomeType = {
      id: 'some-id',
      // @ts-expect-error derived types still reject incompatible property types.
      count: '3',
    };

    const schema = createSchemaRuntime(jsonPolicy).resolveSchema(SomeType);

    expect(schema.decode(decodedValue)).toEqual(decodedValue);
    expect(schema.encode(decodedValue)).toEqual(decodedValue);
  });

  it('derives recursive decoded and wire types from schema definitions', () => {
    type Node = {
      value: Date;
      child?: Node;
    };

    type NodeWire = {
      value: string;
      child?: NodeWire;
    };

    const StringDateSchema = z.codec(z.string(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    });

    const NodeSchema: SchemaDef<z.ZodType<Node, NodeWire>> = defineSchema(
      (runtime) =>
        z.object({
          value: StringDateSchema,
          child: z.lazy(() => runtime.resolveSchema(NodeSchema)).optional(),
        }) as z.ZodType<Node, NodeWire>,
      { debugName: 'TypedNodeSchema' },
    );

    type DecodedNode = SchemaOutput<typeof NodeSchema>;
    type WireNode = SchemaInput<typeof NodeSchema>;

    const decodedValue: DecodedNode = {
      value: new Date('2024-01-02T03:04:05.000Z'),
      child: {
        value: new Date('2024-01-03T03:04:05.000Z'),
      },
    };
    const wireValue: WireNode = {
      value: '2024-01-02T03:04:05.000Z',
      child: {
        value: '2024-01-03T03:04:05.000Z',
      },
    };

    // @ts-expect-error recursive decoded values use Date at every level.
    const _invalidDecodedNode: DecodedNode = wireValue;
    // @ts-expect-error recursive wire values use string at every level.
    const _invalidWireNode: WireNode = decodedValue;

    const schema = createSchemaRuntime(jsonPolicy).resolveSchema(NodeSchema);

    expect(schema.decode(wireValue)).toEqual(decodedValue);
    expect(schema.encode(decodedValue)).toEqual(wireValue);
  });
});
