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
import {
  arraySerde,
  FetchRequestFactory,
  MediaType,
  MediaTypeDecoders,
  MediaTypeEncoders,
  numberSerde,
  Problem,
  setSerde,
  stringSerde,
  SundayError,
  unknownSerde,
} from '../src';
import { unknownGet } from '../src/util/any';
import { delayedResponse } from './fetch-mock-utils';
import { objectSerde } from './serde-test-helpers';

type Sub = { value: number };
type Test = { test: string; sub: Sub };

const SubSerde = objectSerde<Sub>('Sub', {
  value: { serde: numberSerde },
});

const TestSerde = objectSerde<Test>('Test', {
  test: { serde: stringSerde },
  sub: { serde: SubSerde },
});

describe('FetchRequestFactory', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  class TestProblem extends Problem {
    static TYPE = 'http://example.com/test';

    constructor() {
      super({
              type: TestProblem.TYPE,
              status: 400,
              title: 'Test Problem',
              detail: 'This is a test problem.',
              instance: 'error:12345',
            });
    }
  }

  const fetchRequestFactory = new FetchRequestFactory('http://example.com');

  it('allows overriding defaults via options', () => {
    const specialDecoders = new MediaTypeDecoders.Builder().build();
    const specialEncoders = new MediaTypeEncoders.Builder().build();
    const quietLogger = {};

    const fac = new FetchRequestFactory('https://example.com', {
      mediaTypeDecoders: specialDecoders,
      mediaTypeEncoders: specialEncoders,
      logger: quietLogger,
    });

    expect(fac.mediaTypeDecoders).toBe(specialDecoders);
    expect(fac.mediaTypeEncoders).toBe(specialEncoders);
    expect(fac.logger).toBe(quietLogger);
  });

  it('replaces path template parameters', async () => {
    expect(
      fetchRequestFactory.request({
                                    method: 'GET',
                                    pathTemplate: '/api/{id}/contents',
                                    pathParameters: { id: '12345' },
                                  }),
    ).resolves.toEqual(
      expect.objectContaining({ url: 'http://example.com/api/12345/contents' }),
    );
  });

  it('adds encoded query parameters', async () => {
    expect(
      fetchRequestFactory.request({
                                    method: 'GET',
                                    pathTemplate: '/api/{id}/contents',
                                    pathParameters: { id: '12345' },
                                    queryParameters: {
                                      limit: 5,
                                      search: '1 & 2',
                                    },
                                  }),
    ).resolves.toEqual(
      expect.objectContaining({
                                url: 'http://example.com/api/12345/contents?limit=5&search=1%20%26%202',
                              }),
    );
  });

  it('fails when no query parameter encoder is registered', async () => {
    const specialEncoders = new MediaTypeEncoders.Builder().build();

    const fetchRequestFactory = new FetchRequestFactory('https://example.com', {
      mediaTypeEncoders: specialEncoders,
    });

    expect(
      fetchRequestFactory.request({
                                    method: 'GET',
                                    pathTemplate: '/api/{id}/contents',
                                    pathParameters: { id: '12345' },
                                    queryParameters: {
                                      limit: 5,
                                    },
                                  }),
    ).rejects.toThrow('Unsupported media type - application/x-www-form-urlencoded');
  });

  it('attaches encoded body based on content-type', async () => {
    const request: Request = await fetchRequestFactory.request({
                                                                 method: 'POST',
                                                                 pathTemplate: '/api/contents',
                                                                 body: { a: 5 },
                                                                 bodyType: unknownSerde,
                                                                 contentTypes: [MediaType.JSON],
                                                               });
    expect(request.url).toBe('http://example.com/api/contents');
    expect(request.text()).resolves.toBe('{"a":5}');
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.value);
  });

  it('sets content-type when body is non-existent', async () => {
    const request: Request = await fetchRequestFactory.request({
                                                                 method: 'POST',
                                                                 pathTemplate: '/api/contents',
                                                                 contentTypes: [MediaType.JSON],
                                                               });
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.value);
  });

  it('fetches typed results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }, TestSerde),
    ).resolves.toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('fetches typed array of results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.result(
        { method: 'GET', pathTemplate: '' },
        arraySerde(TestSerde),
      ),
    ).resolves.toEqual([{ test: 'a', sub: { value: 5 } }]);
  });

  it('fetches typed set of results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.result(
        { method: 'GET', pathTemplate: '' },
        setSerde(TestSerde),
      ),
    ).resolves.toEqual(new Set([{ test: 'a', sub: { value: 5 } }]));
  });

  it('fetches typed result responses', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.resultResponse(
        { method: 'GET', pathTemplate: '' },
        TestSerde,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
                                result: { test: 'a', sub: { value: 5 } },
                                response: expect.anything(),
                              }),
    );
  });

  it('fetches typed void result responses', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.resultResponse({ method: 'GET', pathTemplate: '' }),
    ).resolves.toEqual(
      expect.objectContaining({ result: undefined, response: expect.anything() }),
    );
  });

  it('fetches typed array of result response', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.resultResponse(
        { method: 'GET', pathTemplate: '' },
        arraySerde(TestSerde),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
                                result: [{ test: 'a', sub: { value: 5 } }],
                                response: expect.anything(),
                              }),
    );
  });

  it('fetches typed set of result responses', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      fetchRequestFactory.resultResponse(
        { method: 'GET', pathTemplate: '' },
        setSerde(TestSerde),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
                                result: new Set([{ test: 'a', sub: { value: 5 } }]),
                                response: expect.anything(),
                              }),
    );
  });

  it('builds event sources via eventSource', async () => {
    const encodedEvent = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([encodedEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.getOnce(
      'http://example.com',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
    });

    const eventSource = fetchRequestFactory.eventSource({
                                                          method: 'GET',
                                                          pathTemplate: '',
                                                        });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for event source message.'));
      }, 5000);

      eventSource.onmessage = () => {
        clearTimeout(timeout);
        eventSource.close();
        resolve();
      };
      eventSource.onerror = (event) => {
        clearTimeout(timeout);
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
    });
  });

  it('builds async iterable events via eventStream', async () => {
    const encodedEvent = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: {"target":"world"}\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([encodedEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.getOnce(
      'http://example.com',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
    });

    const eventStream = fetchRequestFactory.eventStream(
      { method: 'GET', pathTemplate: '' },
      (decoder, _event, _id, data) => decoder.decodeText(data, unknownSerde),
    );

    const iterator = eventStream[Symbol.asyncIterator]();
    const { value } = await iterator.next();
    await iterator.return?.();

    expect(value).toEqual(
      expect.objectContaining({
                                target: 'world',
                              }),
    );
  });

  it('aborts response with an AbortSignal', async () => {
    fetchMock.getOnce('http://example.com', () =>
      delayedResponse({ status: 204 }, 100_000),
    );

    const abort = new AbortController();
    const responsePromise = fetchRequestFactory.response(
      { method: 'GET', pathTemplate: '', signal: abort.signal },
      true,
    );

    abort.abort();

    expect(responsePromise).rejects.toThrow(/Abort/i);
  });

  it('aborts result with an AbortSignal', async () => {
    fetchMock.getOnce('http://example.com', () =>
      delayedResponse(
        {
          status: 200,
          headers: { 'content-type': MediaType.JSON.value },
          body: '{ "message": "Hello World" }',
        },
        100_000,
      ),
    );

    const abort = new AbortController();
    const resultPromise = fetchRequestFactory.result(
      { method: 'GET', pathTemplate: '', signal: abort.signal },
      unknownSerde,
    );

    abort.abort();

    expect(resultPromise).rejects.toThrow(/Abort/i);
  });

  it('aborts eventStream when signal is aborted', async () => {
    fetchMock.getOnce('http://example.com', () =>
      delayedResponse(
        new Response(new Blob([]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
        100_000,
      ),
    );

    const abort = new AbortController();
    const eventStream = fetchRequestFactory.eventStream(
      { method: 'GET', pathTemplate: '', signal: abort.signal },
      (decoder, _event, _id, data) => decoder.decodeText(data, unknownSerde),
    );

    const iterator = eventStream[Symbol.asyncIterator]();
    const nextPromise = iterator.next();

    abort.abort();

    expect(nextPromise).rejects.toThrow(/Abort/i);
    await iterator.return?.();
  });

  it('aborts eventSource when signal is aborted', async () => {
    fetchMock.getOnce('http://example.com', () =>
      delayedResponse({ status: 200 }, 100_000),
    );

    const abort = new AbortController();
    const eventSource = fetchRequestFactory.eventSource({
      method: 'GET',
      pathTemplate: '',
      signal: abort.signal,
    });

    const errorPromise = new Promise<void>((resolve, reject) => {
      eventSource.onerror = (ev) => {
        const error = unknownGet(ev, 'error');
        if (error instanceof DOMException && error.name === 'AbortError') {
          eventSource.close();
          resolve();
          return;
        }
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(error)}`));
      };
      eventSource.connect();
    });

    abort.abort();

    expect(errorPromise).resolves.toBeUndefined();
  });

  it('passes an abortable signal to adapter requests for eventSource', async () => {
    fetchMock.getOnce('http://example.com', () =>
      delayedResponse({ status: 200 }, 100_000),
    );

    let resolveSignal: (signal: AbortSignal | undefined) => void = () => {};
    const adapterSignalPromise = new Promise<AbortSignal | undefined>(
      (resolve) => {
        resolveSignal = resolve;
      },
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
      adapter: {
        adapt: async (_requestFactory, request) => {
          resolveSignal(request.signal ?? undefined);
          return request;
        },
      },
    });

    const abort = new AbortController();
    const eventSource = fetchRequestFactory.eventSource({
      method: 'GET',
      pathTemplate: '',
      signal: abort.signal,
    });

    const errorPromise = new Promise<void>((resolve, reject) => {
      eventSource.onerror = (ev) => {
        const error = unknownGet(ev, 'error');
        if (error instanceof DOMException && error.name === 'AbortError') {
          eventSource.close();
          resolve();
          return;
        }
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(error)}`));
      };
      eventSource.connect();
    });

    const adapterSignal = await adapterSignalPromise;
    expect(adapterSignal).toBeDefined();

    abort.abort();

    expect(errorPromise).resolves.toBeUndefined();
    expect(adapterSignal?.aborted).toBeTrue();
  });

  it('throws typed problems for registered problem types', async () => {
    fetchRequestFactory.registerProblem(TestProblem.TYPE, TestProblem);

    const problemJSON = JSON.stringify({
                                         type: TestProblem.TYPE,
                                         status: 400,
                                         title: 'Invalid Id',
                                         detail: 'One or more characters is not allowed',
                                         instance: 'error:12345',
                                       });

    fetchMock.getOnce('http://example.com', {
      body: problemJSON,
      status: 400,
      headers: { 'content-type': MediaType.Problem.value },
    });

    expect(
      fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
    ).rejects.toBeInstanceOf(TestProblem);
  });

  it('throws generic problems for unregistered problem types', async () => {
    const testProblem = new TestProblem();

    const problemJSON = JSON.stringify({
                                         type: TestProblem.TYPE,
                                         title: testProblem.title,
                                         status: testProblem.status,
                                         detail: testProblem.detail,
                                         instance: testProblem.instance,
                                       });

    fetchMock.getOnce('http://example.com', {
      body: problemJSON,
      status: 400,
      headers: { 'content-type': MediaType.Problem.value },
    });

    expect(
      fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('translates non-problem error responses to generic problems', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '<error>Error</error>',
      status: 400,
      headers: { 'content-type': MediaType.HTML.value },
    });

    expect(fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }))
      .rejects
      .toThrow(Problem.fromStatus(400, 'Bad Request'));
  });

  it('throws SundayError when decoding fails', async () => {
    fetchMock.getOnce(
      'http://example.com',
      new Response('<test>Test</test>', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/x-unknown-type' },
      }),
    );

    expect(
      fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }, stringSerde),
    ).rejects.toBeInstanceOf(SundayError);
  });
});
