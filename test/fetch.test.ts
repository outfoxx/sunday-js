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
import { FetchRequestFactory, MediaType, Problem, SundayError } from '../src';

describe('Fetch API Utilities', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
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
