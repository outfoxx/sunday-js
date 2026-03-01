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
import { ResponseExample } from './fetch.js';
import {
  defineSchema,
  SchemaLike,
} from './schema-runtime.js';

export interface Problem {
  type: URL;
  title: string;
  status: number;
  detail?: string;
  instance?: URL;

  [key: string]: unknown;
}

export const ProblemWireSchema = z.looseObject({
  type: z.union([z.string(), z.instanceof(URL)]).optional(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.union([z.string(), z.instanceof(URL)]).optional(),
});

export type ProblemSpec = z.infer<typeof ProblemWireSchema>;

export class Problem extends Error implements Problem {

  public static BLANK_URL = new URL('about:blank');

  public type: URL;

  public title: string;

  public status: number;

  public detail?: string;

  public instance?: URL;

  private _parameters?: Record<string, unknown>;

  public get parameters(): Record<string, unknown> | undefined {
    return this._parameters;
  }

  constructor(spec: ProblemSpec) {
    super(`${spec.status.toString()} ${spec.type} - ${spec.title}`);

    const { type, title, status, detail, instance, ...parameters } = spec;
    delete parameters.stack; // Fix for browsers that add stack to Error objects

    this.type = Problem.parseURL(type) ?? Problem.BLANK_URL;
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.instance = Problem.parseURL(instance);
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

  private static parseURL(value: unknown | undefined | null): URL | undefined {
    if (value == null) {
      return undefined;
    }
    if (value instanceof URL) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        return new URL(value);
      }
      catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function createProblemCodec<
  TProblem extends Problem,
  TWire extends z.infer<typeof ProblemWireSchema>,
>(
  problemType: new (spec: TWire) => TProblem,
  wireSchema: z.ZodType<TWire>,
): z.ZodType<TProblem> {
  return z.codec(wireSchema, z.instanceof(problemType), {
    decode: (value) => new problemType(value),
    encode: (value) => ({
      type: value.type?.toString() ?? Problem.BLANK_URL.toString(),
      title: value.title,
      status: value.status,
      detail: value.detail,
      instance: value.instance?.toString(),
      ...(value.parameters ?? {}),
    }) as TWire,
  });
}

export const ProblemSchema: SchemaLike<Problem> = defineSchema(
  () => createProblemCodec(Problem, ProblemWireSchema),
  {
    id: Symbol.for('@outfoxx/sunday/ProblemSchema'),
    debugName: 'ProblemSchema',
  },
);
