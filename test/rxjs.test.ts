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

import fetchMock from 'fetch-mock';
import { first, firstValueFrom } from 'rxjs';
import {
  FetchRequestFactory,
  MediaType,
  nullifyNotFound,
  nullifyResponse,
  Problem,
  promiseFrom,
} from '../src';
import { delayedResponse } from './fetch-mock-utils';
import { delay } from './promises';
import objectContaining = jasmine.objectContaining;

describe('RxJS Utils', () => {
  beforeEach(() => {
    fetchMock.reset();
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

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyNotFound(), first()),
      ),
    ).toBeResolvedTo(null);
  });

  it('nullifyResponse translates selected problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([], [TestProblem]), first()),
      ),
    ).toBeResolvedTo(null);
  });

  it('nullifyResponse passes other statuses', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(400, 'Bad Request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([404], []), first()),
      ),
    ).toBeRejectedWithError(Problem);
  });

  it('nullifyResponse passes other problems', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new AnotherProblem(),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([], [TestProblem]), first()),
      ),
    ).toBeRejectedWithError(AnotherProblem, /Another Problem/i);
  });

  it('nullifyResponse passes other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      firstValueFrom(
        fetchRequestFactory
          .result({ method: 'GET', pathTemplate: '' })
          .pipe(nullifyResponse([405], [TestProblem]), first()),
      ),
    ).toBeRejectedWithError(Error, /Failed to send request/i);
  });

  it('promiseFrom resolves to first value with signal', async () => {
    fetchMock.getOnce('http://example.com', {
      status: 200,
      headers: { 'content-type': MediaType.JSON.value },
      body: '{ "message": "Hello World" }',
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    const abort = new AbortController();

    await expectAsync(
      promiseFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }, [
          Object,
        ]),
        abort.signal,
      ),
    ).toBeResolvedTo(objectContaining({ message: 'Hello World' }));
  });

  it('promiseFrom resolves to first value without signal', async () => {
    fetchMock.getOnce('http://example.com', {
      status: 200,
      headers: { 'content-type': MediaType.JSON.value },
      body: '{ "message": "Hello World" }',
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      promiseFrom(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }, [
          Object,
        ]),
      ),
    ).toBeResolvedTo(objectContaining({ message: 'Hello World' }));
  });

  it('promiseFrom supports abort', async () => {
    fetchMock.get('http://example.com', () =>
      delayedResponse({ status: 204, body: '{"a":"b"}' }, 100_000),
    );

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    const abort = new AbortController();

    await expectAsync(
      Promise.all([
        promiseFrom(
          fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }, [
            Object,
          ]),
          abort.signal,
        ),
        delay(100).then(() => abort.abort()),
      ]),
    ).toBeRejectedWithError('sequence was aborted');
  });
});
