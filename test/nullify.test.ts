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
  nullifyNotFound,
  nullifyProblem,
  Problem,
} from '../src';

describe('Async Utils', () => {
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
      nullifyNotFound(fetchRequestFactory.result({ method: 'GET', pathTemplate: '' })),
    ).resolves.toBeNull();
  });

  it('nullifyProblem translates select problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [],
        [z.instanceof(TestProblem)],
      ),
    ).resolves.toBeNull();
  });

  it('nullifyProblem translates select statuses to null', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [404],
        [],
      ),
    ).resolves.toBeNull();
  });

  it('nullifyNotFound throws other statuses', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(400, 'Bad Request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyNotFound(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('nullifyNotFound throws other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyNotFound(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
      ),
    ).rejects.toThrow(/Failed to send request/i);
  });

  it('nullifyProblem throws other problems', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new AnotherProblem(),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [],
        [z.instanceof(TestProblem)],
      ),
    ).rejects.toBeInstanceOf(AnotherProblem);
  });

  it('nullifyProblem throws other statuses', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Problem.fromStatus(400, 'Bad Request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [404],
        [],
      ),
    ).rejects.toBeInstanceOf(Problem);
  });

  it('nullifyProblem throws other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [405],
        [z.instanceof(TestProblem)],
      ),
    ).rejects.toThrow(/Failed to send request/i);
  });

  it('nullifyProblem supports predicate matchers', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: new TestProblem(),
      status: 404,
      headers: { 'content-type': MediaType.Problem.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    expect(
      nullifyProblem(
        fetchRequestFactory.result({ method: 'GET', pathTemplate: '' }),
        [],
        [(problem) => problem.type.toString() === TestProblem.TYPE],
      ),
    ).resolves.toBeNull();
  });
});
