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
import { catchError, firstValueFrom } from 'rxjs';
import { FetchRequestFactory, MediaType, Problem, SundayError } from '../src';
import any = jasmine.any;

describe('Fetch API Utilities', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('validate throws SundayError for 204 when data expected', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      new Response(null, {
        status: 204,
        statusText: 'No Content',
        headers: {},
      })
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    await expectAsync(
      firstValueFrom(
        requestFactory
          .response({ method: 'GET', pathTemplate: '/test' }, true)
          .pipe(
            catchError((err) => {
              throw err;
            })
          )
      )
    ).toBeRejectedWith(any(SundayError));
  });

  it('validate throws Problem for HTTP error responses', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      new Response('<error>There was an error</error>', {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'text/html' },
      })
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    await expectAsync(
      firstValueFrom(
        requestFactory
          .response({ method: 'GET', pathTemplate: '/test' }, true)
          .pipe(
            catchError((err) => {
              throw err;
            })
          )
      )
    ).toBeRejectedWith(any(Problem));
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
        headers: { 'content-type': MediaType.ProblemJSON.value },
      })
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    await expectAsync(
      firstValueFrom(
        requestFactory
          .response({ method: 'GET', pathTemplate: '/test' }, true)
          .pipe(
            catchError((err) => {
              throw err;
            })
          )
      )
    ).toBeRejectedWith(any(Problem));
  });
});
