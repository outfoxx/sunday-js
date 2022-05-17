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

import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import fetchMock from 'fetch-mock';
import { first, firstValueFrom } from 'rxjs';
import {
  FetchRequestFactory,
  JSONEncoder,
  MediaType,
  MediaTypeDecoders,
  MediaTypeEncoders,
  Problem,
  SundayError,
} from '../src';
import any = jasmine.any;
import objectContaining = jasmine.objectContaining;

describe('FetchRequestFactory', () => {
  beforeEach(() => {
    fetchMock.reset();
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
    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api/{id}/contents',
            pathParameters: { id: '12345' },
          })
          .pipe(first())
      )
    ).toBeResolvedTo(
      objectContaining({ url: 'http://example.com/api/12345/contents' })
    );
  });

  it('adds encoded query parameters', async () => {
    await expectAsync(
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
          .pipe(first())
      )
    ).toBeResolvedTo(
      objectContaining({
        url: 'http://example.com/api/12345/contents?limit=5&search=1%20%26%202',
      })
    );
  });

  it('fails when no query parameter encoder is registered', async () => {
    const specialEncoders = new MediaTypeEncoders.Builder().build();

    const fetchRequestFactory = new FetchRequestFactory('https://example.com', {
      mediaTypeEncoders: specialEncoders,
    });

    await expectAsync(
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
          .pipe(first())
      )
    ).toBeRejectedWithError(Error, /Unsupported Media Type/i);
  });

  it('fails query parameter encoder is not a URLQueryParamsEncoder', async () => {
    const specialEncoders = new MediaTypeEncoders.Builder()
      .addDefaults()
      .add(MediaType.WWWFormUrlEncoded, JSONEncoder.default)
      .build();

    const fetchRequestFactory = new FetchRequestFactory('https://example.com', {
      mediaTypeEncoders: specialEncoders,
    });

    await expectAsync(
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
          .pipe(first())
      )
    ).toBeRejectedWithError(Error, /URLQueryParamsEncoder/i);
  });

  it('adds accept header', async () => {
    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'POST',
            pathTemplate: '/api/contents',
            body: { a: 5 },
            bodyType: [Object],
            contentTypes: [MediaType.JSON],
            acceptTypes: [MediaType.JSON, MediaType.CBOR],
          })
          .pipe(first())
      ).then((req) => Array.from(req.headers.keys()))
    ).toBeResolvedTo(Array.from(['accept', 'content-type']));
  });

  it('adds custom headers', async () => {
    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api/add-custom-headers',
            headers: {
              Authorization: 'Bearer 12345',
            },
          })
          .pipe(first())
      ).then((req) => Array.from(req.headers.keys()))
    ).toBeResolvedTo(Array.from(['authorization']));
  });

  it('fails if none of the accept types has a decoder', async () => {
    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'GET',
            pathTemplate: '/api',
            acceptTypes: [MediaType.from('application/x-unknown') as MediaType],
          })
          .pipe(first())
      )
    ).toBeRejectedWithError(Error, /accept types/i);
  });

  it('fails if none of the content types has an encoder', async () => {
    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .request({
            method: 'POST',
            pathTemplate: '/api',
            body: { a: 1 },
            contentTypes: [
              MediaType.from('application/x-unknown') as MediaType,
            ],
          })
          .pipe(first())
      )
    ).toBeRejectedWithError(Error, /content types/i);
  });

  it('attaches encoded body based on content-type', async () => {
    const request: Request = await firstValueFrom(
      fetchRequestFactory
        .request({
          method: 'POST',
          pathTemplate: '/api/contents',
          body: { a: 5 },
          bodyType: [Object],
          contentTypes: [MediaType.JSON],
        })
        .pipe(first())
    );
    expect(request.url).toBe('http://example.com/api/contents');
    await expectAsync(request.text()).toBeResolvedTo('{"a":5}');
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
        .pipe(first())
    );
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.value);
  });

  it('fetches typed results', async () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number
      ) {}
    }

    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub
      ) {}
    }

    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, [Test])
          .pipe(first())
      )
    ).toBeResolvedTo(new Test('a', new Sub(5)));
  });

  it('builds event sources via eventSource', (done) => {
    const encodedEvent = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([encodedEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.getOnce(
      'http://example.com',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
      { overwriteRoutes: false }
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
    });

    const eventSource = fetchRequestFactory.eventSource({
      method: 'GET',
      pathTemplate: '',
    });
    eventSource.onmessage = () => {
      eventSource.close();
      done();
    };
    eventSource.connect();
  });

  it('builds observable events via eventStream', async () => {
    const encodedEvent = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: {"target":"world"}\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([encodedEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.getOnce(
      'http://example.com',
      () => new Promise((resolve) => setTimeout(resolve, 5000)),
      { overwriteRoutes: false }
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com', {
      logger: {},
    });

    const event$ = fetchRequestFactory.eventStream(
      { method: 'GET', pathTemplate: '' },
      (decoder, event, id, data) => decoder.decodeText(data, [Object])
    );

    await expectAsync(firstValueFrom(event$.pipe(first()))).toBeResolvedTo(
      objectContaining({
        target: 'world',
      })
    );
  });

  it('throws typed problems for registered problem types', async () => {
    //
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
      headers: { 'content-type': MediaType.ProblemJSON.value },
    });

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first())
      )
    ).toBeRejectedWith(new TestProblem());
  });

  it('throws generic problems for unregistered problem types', async () => {
    //
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
      headers: { 'content-type': MediaType.ProblemJSON.value },
    });

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first())
      )
    ).toBeRejectedWith(new Problem(testProblem));
  });

  it('translates non-problem error responses to generic problems', async () => {
    //
    fetchMock.getOnce('http://example.com', {
      body: '<error>Error</error>',
      status: 400,
      headers: { 'content-type': MediaType.HTML.value },
    });

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(first())
      )
    ).toBeRejectedWith(Problem.fromStatus(400, 'Bad Request'));
  });

  it('throws SundayError when decoding fails', async () => {
    //
    fetchMock.getOnce(
      'http://example.com',
      new Response('<test>Test</test>', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/x-unknown-type' },
      })
    );

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' }, [String])
          .pipe(first())
      )
    ).toBeRejectedWith(any(SundayError));
  });
});
