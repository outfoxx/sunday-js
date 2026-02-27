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
import { firstValueFrom } from 'rxjs';
import {
  FetchRequestFactory,
  MediaType,
  nullifyNotFound,
  nullifyPromiseResponse,
  nullifyResponse,
  Problem,
  promiseFrom,
  unknownSerde,
} from '../src';
import { delayedResponse } from './fetch-mock-utils';
import { delay } from './promises';

describe('RxJS Utils', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  class TestProblem extends Problem {
    static TYPE = 'http://example.com/test';
    constructor() {
      super({
        type: TestProblem.TYPE,
        status: 404,
        title: 'Test Problem',
        detail: 'This is a test problem.',
        instance: 'error:12345',
      });
    }
  }

  class AnotherProblem extends Problem {
    static TYPE = 'http://example.com/test';
    constructor() {
      super({
        type: AnotherProblem.TYPE,
        status: 404,
        title: 'Another Problem',
        detail: 'This is another problem.',
        instance: 'error:12345',
      });
    }
  }

  it('nullifyNotFound translates 404 problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(404, 'Not Found'),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyNotFound()),
      ),
    ).resolves.toBeNull();
  });

  it('nullifyResponse translates selected problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([], [TestProblem])),
      ),
    ).resolves.toBeNull();
  });

  it('nullifyPromiseResponse translates selected problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ).catch(nullifyPromiseResponse([], [TestProblem])),
    ).resolves.toBeNull();
  });

  it('nullifyResponse passes other statuses', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(400, 'Bad Request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([404], [])),
      ),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('nullifyPromiseResponse passes other statuses', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(400, 'Bad Request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ).catch(nullifyPromiseResponse([404], [])),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('nullifyResponse passes other problems', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new AnotherProblem(),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([], [TestProblem])),
      ),
    ).rejects.toBeInstanceOf(AnotherProblem);
  });

  it('nullifyPromiseResponse passes other problems', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new AnotherProblem(),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ).catch(nullifyPromiseResponse([], [TestProblem])),
    ).rejects.toBeInstanceOf(AnotherProblem);
  });

  it('nullifyResponse passes other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([405], [TestProblem])),
      ),
    ).rejects.toThrow(/Failed to send request/i);
  });

  it('nullifyPromiseResponse passes other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      firstValueFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ).catch(nullifyPromiseResponse([405], [TestProblem])),
    ).rejects.toThrow(/Failed to send request/i);
  });

  it('promiseFrom resolves to first value with signal', async () => {
    fetchMock.getOnce('http://example.com', {
      status: 200,
      headers: { 'content-type': MediaType.JSON.value },
      body: '{ "message": "Hello World" }',
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    const abort = new AbortController();

    expect(
      promiseFrom(
        fetchRequestFactory.result(
          { method: 'GET', pathTemplate: '' },
          unknownSerde,
        ),
        abort.signal,
      ),
    ).resolves.toEqual(expect.objectContaining({ message: 'Hello World' }));
  });

  it('promiseFrom resolves to first value without signal', async () => {
    fetchMock.getOnce('http://example.com', {
      status: 200,
      headers: { 'content-type': MediaType.JSON.value },
      body: '{ "message": "Hello World" }',
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      promiseFrom(
        fetchRequestFactory.result(
          { method: 'GET', pathTemplate: '' },
          unknownSerde,
        ),
      ),
    ).resolves.toEqual(expect.objectContaining({ message: 'Hello World' }));
  });

  it('promiseFrom supports abort', async () => {
    fetchMock.get('http://example.com', () =>
      delayedResponse({ status: 204, body: '{"a":"b"}' }, 100_000),
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    const abort = new AbortController();

    expect(
      Promise.all([
        promiseFrom(
          fetchRequestFactory.result(
            { method: 'GET', pathTemplate: '' },
            unknownSerde,
          ),
          abort.signal,
        ),
        delay(100).then(() => abort.abort()),
      ]),
    ).rejects.toThrow('sequence was aborted');
  });
});
