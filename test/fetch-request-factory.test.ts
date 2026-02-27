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

import {beforeEach, describe, it, expect} from 'bun:test';
import fetchMock from 'fetch-mock';
import { first, firstValueFrom } from 'rxjs';
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
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api/{id}/contents',
            pathParameters: { id: '12345' },
          })
          .pipe(first()),
      ),
    ).resolves.toEqual(
      expect.objectContaining({ url: 'http://example.com/api/12345/contents' }),
    );
  });

  it('adds encoded query parameters', async () => {
    expect(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api/{id}/contents',
            pathParameters: { id: '12345' },
            queryParameters: {
              limit: 5,
              search: '1 & 2',
            },
          })
          .pipe(first()),
      ),
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
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api/{id}/contents',
            pathParameters: { id: '12345' },
            queryParameters: {
              limit: 5,
            },
          })
          .pipe(first()),
      ),
    ).rejects.toThrow('Unsupported media type - application/x-www-form-urlencoded');
  });

  it('attaches encoded body based on content-type', async () => {
    const request: Request = await firstValueFrom(
      fetchRequestFactory
        .request({
          method: 'POST',
          pathTemplate: '/api/contents',
          body: { a: 5 },
          bodyType: unknownSerde,
          contentTypes: [MediaType.JSON],
        })
        .pipe(first()),
    );
    expect(request.url).toBe('http://example.com/api/contents');
    expect(request.text()).resolves.toBe('{"a":5}');
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.value);
  });

  it('sets content-type when body is non-existent', async () => {
    const request: Request = await firstValueFrom(
      fetchRequestFactory
        .request({
          method: 'POST',
          pathTemplate: '/api/contents',
          contentTypes: [MediaType.JSON],
        })
        .pipe(first()),
    );
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.value);
  });

  it('fetches typed results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, TestSerde)
          .pipe(first()),
      ),
    ).resolves.toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('fetches typed array of results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, arraySerde(TestSerde))
          .pipe(first()),
      ),
    ).resolves.toEqual([{ test: 'a', sub: { value: 5 } }]);
  });

  it('fetches typed set of results', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '[{"test":"a","sub":{"value":5}}]',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, setSerde(TestSerde))
          .pipe(first()),
      ),
    ).resolves.toEqual(new Set([{ test: 'a', sub: { value: 5 } }]));
  });

  it('fetches typed result responses', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      firstValueFrom(
        fetchRequestFactory
          .resultResponse({ method: 'GET', pathTemplate: '' }, TestSerde)
          .pipe(first()),
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
      firstValueFrom(
        fetchRequestFactory
          .resultResponse({ method: 'GET', pathTemplate: '' })
          .pipe(first()),
      ),
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
      firstValueFrom(
        fetchRequestFactory
          .resultResponse(
            { method: 'GET', pathTemplate: '' },
            arraySerde(TestSerde),
          )
          .pipe(first()),
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
      firstValueFrom(
        fetchRequestFactory
          .resultResponse(
            { method: 'GET', pathTemplate: '' },
            setSerde(TestSerde),
          )
          .pipe(first()),
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

  it('builds observable events via eventStream', async () => {
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

    const event$ = fetchRequestFactory.eventStream(
      { method: 'GET', pathTemplate: '' },
      (decoder, _event, _id, data) => decoder.decodeText(data, unknownSerde),
    );

    expect(firstValueFrom(event$.pipe(first()))).resolves.toEqual(
      expect.objectContaining({
        target: 'world',
      }),
    );
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
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first()),
      ),
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
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first()),
      ),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('translates non-problem error responses to generic problems', async () => {
    fetchMock.getOnce('http://example.com', {
      body: '<error>Error</error>',
      status: 400,
      headers: { 'content-type': MediaType.HTML.value },
    });

    try {
      await firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first()),
      );
      throw new Error('Expected request to throw.');
    } catch (error) {
      expect(error).toBeInstanceOf(Problem);
      const problem = error as Problem;
      const expected = Problem.fromStatus(400, 'Bad Request');
      expect(problem.status).toBe(expected.status);
      expect(problem.title).toBe(expected.title);
    }
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
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, stringSerde)
          .pipe(first()),
      ),
    ).rejects.toBeInstanceOf(SundayError);
  });
});
