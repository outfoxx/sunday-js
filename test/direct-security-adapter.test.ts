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

import { afterEach, beforeEach, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import {
  FetchTransport,
  RequestAdapters,
  RequestCancellationError,
  requestSecurityBindings,
  copyRequest,
  type SecurityBinding,
} from '../src';

const binding: SecurityBinding = {
  scheme: 'bearerAuth',
  provider: 'application',
  flow: 'external',
  scopes: [],
  audience: 'https://api.example',
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};
const spec = {
  method: 'GET' as const,
  pathTemplate: '/value',
  security: [binding],
};
beforeEach(() => {
  fetchMock.hardReset();
  fetchMock.mockGlobal();
});
afterEach(() => fetchMock.hardReset());

it('exposes immutable bindings through export, adapter replacement and response without token providers', async () => {
  let calls = 0;
  let observedBody = '';
  const adapter = {
    adapt(request: Request) {
      expect(requestSecurityBindings(request)).toEqual([binding]);
      expect(
        Object.isFrozen(requestSecurityBindings(request)[0].transport),
      ).toBe(true);
      calls++;
      return new Request(request, {
        headers: { Authorization: 'Bearer custom' },
      });
    },
  };
  const transport = new FetchTransport('https://api.example', {
    requestAdapter: new RequestAdapters(adapter, {
      adapt(request: Request) {
        expect(requestSecurityBindings(request)).toEqual([binding]);
        return copyRequest(request);
      },
    }),
    responseAdapter: {
      async adapt(response: Response, request: Request) {
        expect(requestSecurityBindings(request)).toEqual([binding]);
        expect(request.headers.get('Authorization')).toBe('Bearer custom');
        observedBody = await response.clone().text();
        return response;
      },
    },
  });
  const exported = await transport.transportRequest(spec);
  expect(exported.headers.get('Authorization')).toBe('Bearer custom');
  fetchMock.get('https://api.example/value', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    body: 'original',
  });
  await expect(transport.transportResponse(spec)).rejects.toMatchObject({
    status: 401,
  });
  expect(observedBody).toBe('original');
  expect(fetchMock.callHistory.calls()).toHaveLength(1);
  expect(calls).toBe(2);
});

it('preserves adapter cancellation before network dispatch without token machinery', async () => {
  const stop = new RequestCancellationError(
    'application authorization unavailable',
  );
  const transport = new FetchTransport('https://api.example', {
    requestAdapter: {
      adapt() {
        throw stop;
      },
    },
  });
  fetchMock.get('https://api.example/value', 200);
  await expect(transport.transportResponse(spec)).rejects.toBe(stop);
  expect(fetchMock.callHistory.calls()).toHaveLength(0);
});
