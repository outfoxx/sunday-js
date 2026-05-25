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
  ExtEventSource,
  Logger,
  Problem,
  Transport,
  RequestSpec,
  SchemaLike,
  TextMediaTypeDecoder,
  URLTemplate,
  createOperation,
  createNullableOperation,
} from '../src';
import { OperationResponse } from '../src/operation-response';

const TestSchema = z.object({
  id: z.string(),
});

describe('Operation', () => {
  it('executes through the transport with a response schema', async () => {
    const transport = new TestTransport({ id: '123' });
    const operation = createOperation(transport, {
      request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
      responseType: TestSchema,
    });

    await expect(operation.execute()).resolves.toEqual({ id: '123' });

    expect(transport.resultCalls).toEqual([
      {
        request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
        resultType: TestSchema,
      },
    ]);
  });

  it('executes void operations without a response schema', async () => {
    const transport = new TestTransport(undefined);
    const operation = createOperation(transport, {
      request: { method: 'DELETE', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
    });

    await expect(operation.execute()).resolves.toBeUndefined();

    expect(transport.resultCalls).toEqual([
      {
        request: { method: 'DELETE', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
        resultType: undefined,
      },
    ]);
  });

  it('returns operation responses through the transport', async () => {
    const transport = new TestTransport({ id: '123' });
    const operation = createOperation(transport, {
      request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
      responseType: TestSchema,
    });

    const response = await operation.response();

    expect(response.result).toEqual({ id: '123' });
    expect(response.transportResponse.status).toBe(200);
    expect(transport.responseCalls).toEqual([
      {
        request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
        resultType: TestSchema,
      },
    ]);
  });

  it('builds native requests and can override the abort signal', async () => {
    const transport = new TestTransport({ id: '123' });
    const originalController = new AbortController();
    const overrideController = new AbortController();
    const operation = createOperation(transport, {
      request: {
        method: 'GET',
        pathTemplate: '/users/{id}',
        pathParameters: { id: '123' },
        signal: originalController.signal,
      },
      responseType: TestSchema,
    });

    await operation.transportRequest({ signal: overrideController.signal });

    expect(transport.requestCalls).toEqual([
      {
        method: 'GET',
        pathTemplate: '/users/{id}',
        pathParameters: { id: '123' },
        signal: overrideController.signal,
      },
    ]);
  });

  it('exposes the generated operation spec', () => {
    const transport = new TestTransport({ id: '123' });
    const spec = {
      request: { method: 'GET' as const, pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
      responseType: TestSchema,
    };
    const operation = createOperation(transport, spec);

    expect(operation.spec).toBe(spec);
  });

  it('executes nullable operations normally when no matching problem is thrown', async () => {
    const transport = new TestTransport({ id: '123' });
    const operation = createNullableOperation(
      transport,
      {
        request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
        responseType: TestSchema,
      },
      { statuses: [404], problemTypes: [] },
    );

    await expect(operation.executeOrNull()).resolves.toEqual({ id: '123' });
  });

  it('executes nullable operations as null when a matching problem is thrown', async () => {
    const transport = new TestTransport(undefined, Problem.fromStatus(404, 'Not Found'));
    const operation = createNullableOperation(
      transport,
      {
        request: { method: 'GET', pathTemplate: '/users/{id}', pathParameters: { id: '123' } },
        responseType: TestSchema,
      },
      { statuses: [404], problemTypes: [] },
    );

    await expect(operation.executeOrNull()).resolves.toBeNull();
  });
});

class TestTransport implements Transport {
  readonly baseUrl = new URLTemplate('https://example.com');
  readonly requestCalls: RequestSpec<unknown>[] = [];
  readonly resultCalls: Array<{
    request: RequestSpec<unknown>;
    resultType: SchemaLike<unknown> | undefined;
  }> = [];
  readonly responseCalls: Array<{
    request: RequestSpec<unknown>;
    resultType: SchemaLike<unknown> | undefined;
  }> = [];

  constructor(
    private readonly resultValue: unknown,
    private readonly resultError: unknown = undefined,
  ) {
  }

  registerProblem(
    _type: URL | string,
    _problemType: SchemaLike<Problem>,
  ): void {
  }

  async transportRequest(requestSpec: RequestSpec<unknown>): Promise<Request> {
    this.requestCalls.push(requestSpec);
    return new Request('https://example.com');
  }

  async transportResponse(): Promise<Response> {
    return new Response(null, { status: 200 });
  }

  async response<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: SchemaLike<R>,
  ): Promise<OperationResponse<R>>;
  async response<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<OperationResponse<void>>;
  async response(
    request: RequestSpec<unknown>,
    resultType?: SchemaLike<unknown>,
  ): Promise<OperationResponse<unknown>> {
    this.responseCalls.push({ request, resultType });
    return new OperationResponse(this.resultValue, new Response(null, { status: 200 }));
  }

  async result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: SchemaLike<R>,
  ): Promise<R>;
  async result<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<void>;
  async result(
    request: RequestSpec<unknown>,
    resultType?: SchemaLike<unknown>,
  ): Promise<unknown> {
    this.resultCalls.push({ request, resultType });
    if (this.resultError) {
      throw this.resultError;
    }
    return this.resultValue;
  }

  eventSource(): ExtEventSource {
    throw new Error('Not implemented');
  }

  eventStream<E>(
    _requestSpec: RequestSpec<void>,
    _decoder: (
      decoder: TextMediaTypeDecoder,
      event: string | undefined,
      id: string | undefined,
      data: string,
      logger?: Logger,
    ) => E | undefined,
  ): AsyncIterable<E> {
    throw new Error('Not implemented');
  }
}
