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
import { z, ZodError } from 'zod';
import {
  createProblemCodec,
  JSONDecoder,
  JSONEncoder,
  Problem,
  ProblemSchema,
  ProblemSpec,
  ProblemWireSchema,
} from '../src';
import { expectEqual } from './expect-utils';

describe('Problem', () => {
  it('defaults missing type to about:blank when decoding', () => {
    const decodedProblem = JSONDecoder.default.decodeObject<Problem>(
      {
        title: 'Missing type',
        status: 400,
      },
      ProblemSchema,
    );

    expect(decodedProblem.type.toString()).toBe('about:blank');
  });

  it('throws error on invalid type to about:blank when decoding', () => {
    expect(() => JSONDecoder.default.decodeObject<Problem>(
      {
        type: 42,
        title: 'Invalid type',
        status: 400,
      },
      ProblemSchema,
    )).toThrow(ZodError);
  });

  it('keeps status and title required when decoding', () => {
    expect(() => JSONDecoder.default.decodeObject<Problem>(
      {
        title: 'Missing status',
      },
      ProblemSchema,
    )).toThrow();

    expect(() => JSONDecoder.default.decodeObject<Problem>(
      {
        status: 400,
      },
      ProblemSchema,
    )).toThrow();
  });

  it('serializes parameters on root object', () => {
    const problem = new Problem({
                                  type: new URL('http://example.com/test'),
                                  title: 'Test Problem',
                                  status: 400,
                                  detail: 'Some Details',
                                  instance: new URL('id:12345'),
                                  extra: 'An Extra Value',
                                });

    const problemJSON = JSONEncoder.default.encodeObject(problem, ProblemSchema);
    expect(problemJSON.extra).toBe(problem.parameters?.extra);

    const decodedProblem = JSONDecoder.default.decodeObject<Problem>(
      problemJSON,
      ProblemSchema,
    );

    expectEqual(decodedProblem, problem);
    expect(decodedProblem.parameters).toEqual(problem.parameters);
  });

  it('supports extension codecs built from ProblemWireSchema.extend(...)', () => {
    class ValidationProblem extends Problem {
      public errors: string[];

      constructor(spec: ProblemSpec & { errors: string[] }) {
        super(spec);
        this.errors = spec.errors;
      }
    }

    const ValidationProblemWireSchema = ProblemWireSchema.extend({
                                                                   errors: z.array(z.string()),
                                                                 });

    const ValidationProblemSchema = createProblemCodec(
      ValidationProblem,
      ValidationProblemWireSchema,
    );

    const problem = new ValidationProblem({
                                            type: 'https://example.com/problems/validation',
                                            status: 422,
                                            title: 'Validation failed',
                                            errors: ['name is required'],
                                          });

    const problemJSON = JSONEncoder.default.encodeObject(
      problem,
      ValidationProblemSchema,
    );
    const decodedProblem = JSONDecoder.default.decodeObject(
      problemJSON,
      ValidationProblemSchema,
    );

    expect(decodedProblem).toBeInstanceOf(ValidationProblem);
    expect(decodedProblem.errors).toEqual(problem.errors);
    expect(decodedProblem.type.toString()).toBe(problem.type.toString());
  });
});
