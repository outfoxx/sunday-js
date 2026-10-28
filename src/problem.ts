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

import { constructValidatedModel } from './model-construction.js';
import { z } from 'zod';
import { ResponseExample } from './fetch.js';
import { defineSchema, SchemaLike } from './schema-runtime.js';

export interface Problem {
  type: URL | string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: URL | string;

  [key: string]: unknown;
}

/** RFC 9457 strings accept only string tokens; null and other categories are absent. */
export const ProblemStringSchema = z.codec(
  z.unknown().optional(),
  z.string().optional(),
  {
    decode: (value) => (typeof value === 'string' ? value : undefined),
    encode: (value) => value,
  },
);

/** Exact integral status values, without scalar coercion or numeric truncation. */
export const ProblemStatusSchema = z.codec(
  z.unknown().optional(),
  z.number().int().optional(),
  {
    decode: (value) => (typeof value === 'number' ? value : undefined),
    encode: (value) => value,
  },
);

const ProblemURI = z.union([
  z.instanceof(URL),
  z
    .string()
    .refine(
      (value) =>
        (!/^[a-z][a-z0-9+.-]*:/i.test(value) || URL.canParse(value)) &&
        ![...value].some(
          (character) => /\s/.test(character) || character.codePointAt(0)! < 32,
        ) &&
        !/%(?![0-9a-f]{2})/i.test(value),
      'Invalid Problem URI reference',
    ),
]);

/** Compose string constraints/defaults with Problem URI conversion at a single property. */
export function createProblemReferenceCodec(
  schema: z.ZodType<string | undefined, string | undefined> = z
    .string()
    .optional(),
  defaultType = false,
) {
  const defaults = z
    .string()
    .optional()
    .prefault(defaultType ? 'about:blank' : undefined);
  const constrained = z.codec(z.unknown().optional(), schema, {
    decode: (value) => defaults.parse(ProblemStringSchema.decode(value)),
    encode: (value) => value,
  });
  const reference = constrained.pipe(
    z.codec(z.string().optional(), ProblemURI.optional(), {
      decode: (value, ctx) => {
        if (value === undefined || !/^[a-z][a-z0-9+.-]*:/i.test(value))
          return value;
        try {
          const url = new URL(value);
          // URL canonicalization must not change a literal, pattern, or enum constraint on the wire value.
          return url.toString() === value ? url : value;
        } catch {
          ctx.issues.push({
            code: 'custom',
            input: value,
            message: 'Invalid Problem URI',
          });
          return z.NEVER;
        }
      },
      encode: (value) => value?.toString(),
    }),
  );
  return reference.prefault(defaultType ? 'about:blank' : undefined);
}

/** URI references use URLs only when conversion preserves the original string exactly. */
export const ProblemReferenceSchema = createProblemReferenceCodec();

/** Normalize absence before applying the RFC default, including subtype dispatch. */
export const ProblemTypeSchema = createProblemReferenceCodec(
  z.string(),
  true,
).pipe(ProblemURI);

/** Category/default interpretation for subtype selection, before branch-specific validation. */
export const ProblemDispatchSchema = z.looseObject({
  type: ProblemStringSchema.pipe(z.string().prefault('about:blank')).prefault(
    'about:blank',
  ),
});

/** Normalize the type property before a generated union chooses its branch. */
export function createProblemUnionCodec<T extends z.ZodType>(schema: T) {
  return z.codec(z.record(z.string(), z.unknown()), schema, {
    decode: (value) => ProblemDispatchSchema.decode(value) as z.input<T>,
    encode: (value) => value as Record<string, unknown>,
  });
}

export const ProblemWireSchema = z.looseObject({
  type: ProblemTypeSchema,
  title: ProblemStringSchema,
  status: ProblemStatusSchema,
  detail: ProblemStringSchema,
  instance: ProblemReferenceSchema,
});

/** Constructor input accepts URI strings as well as decoded URL values. */
export interface ProblemSpec {
  type?: string | URL;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string | URL;
  [key: string]: unknown;
}

export class Problem extends Error implements Problem {
  public static readonly BLANK_URL = new URL('about:blank');

  public type: URL | string;

  public title?: string;

  public status?: number;

  public detail?: string;

  public instance?: URL | string;

  private readonly _parameters?: Record<string, unknown>;

  public get parameters(): Record<string, unknown> | undefined {
    return this._parameters;
  }

  constructor(spec: ProblemSpec) {
    super(`${spec.status ?? ''} ${spec.type} - ${spec.title}`);

    const { type, title, status, detail, instance, ...parameters } = spec;

    this.type = type instanceof URL ? type : ProblemTypeSchema.decode(type);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.instance =
      instance instanceof URL
        ? instance
        : ProblemReferenceSchema.decode(instance);
    this._parameters = Object.keys(parameters).length ? parameters : undefined;
  }

  toString(): string {
    const self = this as Record<string, Record<string, unknown>>;
    return JSON.stringify({
      type: this.type,
      status: this.status,
      title: this.title,
      detail: this.detail,
      instance: this.instance,
      url: self.request?.url,
      response: self.response?.example,
    });
  }

  static fromStatus(status: number, title: string): Problem {
    return new Problem({
      type: Problem.BLANK_URL,
      title,
      status,
    });
  }

  static async fromResponse(response: Response): Promise<Problem> {
    const [bodyExcerpt, body] = await ResponseExample.bodyExcerpt(
      response,
      256,
    );

    return new Problem({
      type: Problem.BLANK_URL,
      title: response.statusText,
      status: response.status,
      request: {
        url: response.url,
      },
      response: {
        headers: response.headers,
        ok: response.ok,
        redirected: response.redirected,
        status: response.status,
        statusText: response.statusText,
        type: response.type,
        url: response.url,
        body,
        example: ResponseExample.build(response, bodyExcerpt),
      },
    });
  }
}

export function createProblemCodec<
  TProblem extends Problem,
  TWire extends ProblemSpec,
>(
  problemType: new (spec: TWire) => TProblem,
  wireSchema: z.ZodType<TWire>,
): z.ZodType<TProblem> {
  return z.codec(
    z.codec(z.record(z.string(), z.unknown()), wireSchema, {
      decode: (value) => value as TWire,
      encode: (value) =>
        Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            ([, member]) => member !== undefined,
          ),
        ),
    }),
    z.instanceof(problemType),
    {
      decode: (value) => constructValidatedModel(problemType, value),
      encode: (value) =>
        ({
          ...value.parameters,
          type: value.type,
          title: value.title,
          status: value.status,
          detail: value.detail,
          instance: value.instance,
        }) as TWire,
    },
  );
}

export const ProblemSchema: SchemaLike<Problem> = defineSchema(
  () => createProblemCodec(Problem, ProblemWireSchema),
  {
    id: Symbol.for('@outfoxx/sunday/ProblemSchema'),
    debugName: 'ProblemSchema',
  },
);
