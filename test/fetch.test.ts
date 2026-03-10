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

import { beforeEach, describe, it, expect } from 'bun:test';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import {
  FetchRequestFactory,
  MediaType,
  Problem,
  defineSchema,
  SchemaLike,
  SundayError,
} from '../src';
import { mergeHeaders } from '../src/fetch';

describe('Fetch API Utilities', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('merges headers correctly', () => {

    const ha = new Headers({"a": "1"});
    const hb: HeadersInit = new Headers({"b": "2"});
    const hc: HeadersInit = {"c": "3"};
    const hd: HeadersInit = [["d", "4"]];
    const he: HeadersInit = [["c", "5"]];

    const headers = mergeHeaders(ha, hb, hc, hd, he);
    expect(headers.get("a")).toBe("1");
    expect(headers.get("b")).toBe("2");
    expect(headers.get("c")).toBe("3, 5");
    expect(headers.get("d")).toBe("4");
  });

  it('validate throws SundayError for 204 when data expected', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      new Response(null, {
        status: 204,
        statusText: 'No Content',
        headers: {},
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    expect(
      requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true),
    ).rejects.toThrow(SundayError);
  });

  it('validate throws Problem for HTTP error responses', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      new Response('<error>There was an error</error>', {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'text/html' },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    expect(
      requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true),
    ).rejects.toThrow(Problem);
  });

  it('validate throws Problem for unregistered problem types', async () => {
    const problem = JSON.stringify({
                                     type: 'http://example.com/invali_id',
                                     status: 400,
                                     title: 'Invalid Id',
                                     detail: 'One or more characters are invalid',
                                   });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    expect(
      requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true),
    ).rejects.toThrow(Problem);
  });

  it('validate defaults missing type to about:blank for problem payloads', async () => {
    const problem = JSON.stringify({
      status: 400,
      title: 'Bad Request',
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');

    let thrownProblem: Problem | undefined;
    try {
      await requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true);
    }
    catch (error) {
      expect(error).toBeInstanceOf(Problem);
      thrownProblem = error as Problem;
    }

    if (!thrownProblem) {
      throw new Error('Expected Problem to be thrown');
    }

    expect(thrownProblem.type.toString()).toBe('about:blank');
  });

  it('validate throws error on invalid type for problem payloads', async () => {
    const problem = JSON.stringify({
      type: 12345,
      status: 400,
      title: 'Bad Request',
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');

    expect(requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true))
      .rejects.toThrowError(SundayError);
  });

  it('validate backfills missing status and title from response and warns', async () => {
    const warnings: unknown[][] = [];
    const problem = JSON.stringify({
      type: 'http://example.com/invali_id',
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com', {
      logger: {
        warn: (...data: unknown[]) => warnings.push(data),
      },
    });

    let thrownProblem: Problem | undefined;
    try {
      await requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true);
    }
    catch (error) {
      expect(error).toBeInstanceOf(Problem);
      thrownProblem = error as Problem;
    }

    if (!thrownProblem) {
      throw new Error('Expected Problem to be thrown');
    }

    expect(thrownProblem.status).toBe(400);
    expect(thrownProblem.title).toBe('Bad Request');
    expect(warnings).toHaveLength(2);
    expect(String(warnings[0][0])).toContain('"status"');
    expect(String(warnings[1][0])).toContain('"title"');
  });

  it('validate backfills missing status only and warns once', async () => {
    const warnings: unknown[][] = [];
    const problem = JSON.stringify({
      type: 'http://example.com/invali_id',
      title: 'Explicit Title',
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 422,
        statusText: 'Unprocessable Content',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com', {
      logger: {
        warn: (...data: unknown[]) => warnings.push(data),
      },
    });

    let thrownProblem: Problem | undefined;
    try {
      await requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true);
    }
    catch (error) {
      expect(error).toBeInstanceOf(Problem);
      thrownProblem = error as Problem;
    }

    if (!thrownProblem) {
      throw new Error('Expected Problem to be thrown');
    }

    expect(thrownProblem.status).toBe(422);
    expect(thrownProblem.title).toBe('Explicit Title');
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0][0])).toContain('"status"');
  });

  it('validate backfills missing title only and warns once', async () => {
    const warnings: unknown[][] = [];
    const problem = JSON.stringify({
      type: 'http://example.com/invali_id',
      status: 409,
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 409,
        statusText: 'Conflict',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com', {
      logger: {
        warn: (...data: unknown[]) => warnings.push(data),
      },
    });

    let thrownProblem: Problem | undefined;
    try {
      await requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true);
    }
    catch (error) {
      expect(error).toBeInstanceOf(Problem);
      thrownProblem = error as Problem;
    }

    if (!thrownProblem) {
      throw new Error('Expected Problem to be thrown');
    }

    expect(thrownProblem.status).toBe(409);
    expect(thrownProblem.title).toBe('Conflict');
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0][0])).toContain('"title"');
  });

  it('validate decodes registered problem refs through the schema runtime', async () => {
    const problem = JSON.stringify({
                                     type: RegisteredProblem.TYPE,
                                     status: 409,
                                     title: 'Conflict',
                                   });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 409,
        statusText: 'Conflict',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    requestFactory.registerProblem(RegisteredProblem.TYPE, RegisteredProblemSchema);
    expect(
      requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true),
    ).rejects.toBeInstanceOf(RegisteredProblem);
  });

  it('validate backfills registered problem payloads missing status and title', async () => {
    const warnings: unknown[][] = [];
    const problem = JSON.stringify({
      type: RegisteredProblem.TYPE,
    });

    fetchMock.getOnce(
      'http://example.com/test',
      new Response(problem, {
        status: 409,
        statusText: 'Conflict',
        headers: { 'content-type': MediaType.Problem.value },
      }),
    );

    const requestFactory = new FetchRequestFactory('http://example.com', {
      logger: {
        warn: (...data: unknown[]) => warnings.push(data),
      },
    });
    requestFactory.registerProblem(RegisteredProblem.TYPE, RegisteredProblemSchema);

    let thrownProblem: RegisteredProblem | undefined;
    try {
      await requestFactory.response({ method: 'GET', pathTemplate: '/test' }, true);
    }
    catch (error) {
      expect(error).toBeInstanceOf(RegisteredProblem);
      thrownProblem = error as RegisteredProblem;
    }

    if (!thrownProblem) {
      throw new Error('Expected RegisteredProblem to be thrown');
    }

    expect(thrownProblem.status).toBe(409);
    expect(thrownProblem.title).toBe('Conflict');
    expect(warnings).toHaveLength(2);
  });

  it('aborts response with an AbortSignal', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    const controller = new AbortController();

    const responsePromise = requestFactory.response(
      { method: 'GET', pathTemplate: '/test', signal: controller.signal },
      true,
    );

    controller.abort();

    expect(responsePromise).rejects.toThrow(/Abort/i);
  });
});

class RegisteredProblem extends Problem {
  static TYPE = 'http://example.com/registered';

  constructor(status = 500, title = 'Registered Problem') {
    super({
            type: RegisteredProblem.TYPE,
            status,
            title,
          });
  }
}

const RegisteredProblemSchema: SchemaLike<RegisteredProblem> = defineSchema(
  () =>
  z.codec(
    z.object({
               type: z.string(),
               status: z.number(),
               title: z.string(),
             }),
    z.instanceof(RegisteredProblem),
    {
      decode: (value) => new RegisteredProblem(value.status, value.title),
      encode: (value) => ({
        type: value.type.toString(),
        status: value.status,
        title: value.title,
      }),
    },
  ),
  { debugName: 'RegisteredProblemSchema' },
);
