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
import { z } from 'zod';
import {
  createProblemCodec,
  Problem,
  ProblemWireSchema,
  ProblemStringSchema,
  createProblemReferenceCodec,
  ProblemDispatchSchema,
  createProblemUnionCodec,
} from '../src';

const schema = createProblemCodec(Problem, ProblemWireSchema);

describe('RFC 9457 standard members', () => {
  for (const member of ['type', 'title', 'status', 'detail', 'instance']) {
    for (const wrong of [
      null,
      true,
      false,
      42,
      '401',
      [],
      { nested: [null] },
    ]) {
      if (
        member === 'status'
          ? typeof wrong === 'number'
          : typeof wrong === 'string'
      )
        continue;
      it(`${member}=${JSON.stringify(wrong)} behaves like absence`, () => {
        const baseline = { trace: null, nested: { detail: 42 } };
        const input = { ...baseline, [member]: wrong };
        const original = structuredClone(input);
        const expected = schema.encode(schema.decode(baseline));
        for (const actual of [
          schema.parse(input),
          schema.decode(input),
          schema.safeParse(input).data,
        ]) {
          expect(actual).toBeInstanceOf(Problem);
          expect(schema.encode(actual!)).toEqual(expected);
        }
        expect(input).toEqual(original);
      });
    }
  }

  it('omits absent members, retains empty strings and null extensions', () => {
    expect(schema.encode(schema.decode({}))).toEqual({ type: 'about:blank' });
    const input = {
      type: '',
      title: '',
      detail: '',
      instance: '',
      trace: null,
      stack: null,
      cause: { detail: 42 },
    };
    expect(schema.encode(schema.decode(input))).toEqual(input);
  });

  it('composes defaults and constraints at properties in extendable schemas', () => {
    const extended = ProblemWireSchema.extend({
      detail: ProblemStringSchema.pipe(z.string().min(2).default('fallback')),
      required: z.string(),
    });
    for (const detail of [undefined, null, 42, [], {}]) {
      expect(extended.decode({ detail, required: 'yes' }).detail).toBe(
        'fallback',
      );
    }
    expect(extended.safeParse({ detail: '', required: 'yes' }).success).toBe(
      false,
    );
    expect(extended.safeParse({ detail: null }).success).toBe(false);
  });

  it('keeps reverse validation and correctly typed failures strict', () => {
    expect(() => schema.decode({ status: 401.5 })).toThrow();
    expect(() => schema.decode({ instance: 'invalid uri' })).toThrow();
    const problem = new Problem({});
    Object.assign(problem, { detail: 42 });
    expect(() => schema.encode(problem)).toThrow();
  });
  it('does not replace a missing type with a custom constructor constant', () => {
    const specialized = ProblemWireSchema.extend({
      type: createProblemReferenceCodec(
        z.literal('https://example.com/custom').optional(),
        true,
      ),
    });
    for (const input of [
      {},
      { type: undefined },
      { type: null },
      { type: 42 },
    ]) {
      expect(specialized.safeParse(input).success).toBe(false);
    }
    const dispatch = ProblemDispatchSchema.pipe(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('about:blank'),
          detail: ProblemStringSchema,
        }),
        z.object({
          type: z.literal('https://example.com/custom'),
          detail: ProblemStringSchema,
        }),
      ]),
    );
    for (const type of [undefined, null, 42, [], {}]) {
      expect(dispatch.decode({ type, detail: false })).toEqual({
        type: 'about:blank',
        detail: undefined,
      });
    }
  });
  it('normalizes union tags before required-extension validation in both directions', () => {
    const union = createProblemUnionCodec(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('about:blank'), required: z.string() }),
        z.object({ type: z.literal('urn:custom'), required: z.string() }),
      ]),
    );
    expect(union.decode({ type: null, required: 'yes' })).toEqual({
      type: 'about:blank',
      required: 'yes',
    });
    expect(union.encode({ type: 'about:blank', required: 'yes' })).toEqual({
      type: 'about:blank',
      required: 'yes',
    });
    expect(union.safeParse({ type: null }).success).toBe(false);
  });
});
