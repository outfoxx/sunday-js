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

import { beforeEach, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import {
  ClientSettings,
  FetchTransport,
  StandardAuthenticationAdapter,
  standardTransportFromSettings,
  TokenManager,
  TokenProviderError,
  RequestCancellationError,
  type SecurityBinding,
  type TokenProvider,
} from '../src';

const binding: SecurityBinding = {
  scheme: 'identity',
  provider: 'identity',
  flow: 'clientCredentials',
  scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};
const spec = {
  method: 'GET' as const,
  pathTemplate: '/value',
  security: [binding],
};
beforeEach(() => {
  fetchMock.hardReset().mockGlobal();
});

it('generated settings select standard policy with caller-owned caching, expiry and rejection feedback', async () => {
  let now = 1000,
    acquired = 0,
    refreshed = 0;
  const provider: TokenProvider = {
    identity: 'fixture',
    configure: () => ({ clientIdentity: 'client' }),
    acquire: async () => {
      acquired++;
      return {
        accessToken: 'initial',
        expiresAt: now + 100,
        refreshToken: 'r1',
      };
    },
    refresh: async () => ({
      accessToken: `renewed-${++refreshed}`,
      expiresAt: now + 100,
      refreshToken: 'r2',
    }),
  };
  const manager = new TokenManager(provider, {
    now: () => now,
    expirySkewMs: 0,
  });
  const settings = ClientSettings.resolve(
    'https://example.test',
    { read: [[binding]] },
    { identity: { kind: 'provider', provider: manager } },
  );
  let customRequests = 0,
    customResponses = 0;
  const transport = standardTransportFromSettings(settings, {
    adapter: {
      adapt: async (request) => {
        customRequests++;
        return request;
      },
    },
    responseAdapter: {
      adapt: async (response) => {
        customResponses++;
        return response;
      },
    },
  });
  expect(settings.tokenProviders.identity).toBe(manager);
  expect(acquired).toBe(0);
  fetchMock.get('https://example.test/value', 204, { name: 'value' });
  await transport.transportResponse(spec);
  await transport.transportResponse(spec);
  now += 101;
  await transport.transportResponse(spec);
  expect([acquired, refreshed]).toEqual([1, 1]);
  fetchMock.modifyRoute('value', {
    response: {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
    },
  });
  await expect(transport.transportResponse(spec)).rejects.toBeInstanceOf(
    RequestCancellationError,
  );
  expect([customRequests, customResponses]).toEqual([4, 3]);
  expect(fetchMock.callHistory.calls()).toHaveLength(4);
  fetchMock.modifyRoute('value', { response: 204 });
  await transport.transportResponse(spec);
  expect(refreshed).toBe(2);
});

it('the same generated operation supports custom or no authentication, and explicit missing-provider checks', async () => {
  let calls = 0;
  const custom = {
    adapt: async (request: Request) => {
      calls++;
      request.headers.set('Authorization', 'Custom credential');
      return request;
    },
  };
  const response = {
    adapt: async (response: Response) => {
      calls++;
      return response;
    },
  };
  fetchMock.get('https://example.test/value', 204, { name: 'value' });
  const direct = new FetchTransport('https://example.test', {
    requestAdapter: custom,
    responseAdapter: response,
  });
  await direct.transportResponse(spec);
  expect(calls).toBe(2);
  expect(
    fetchMock.callHistory.lastCall()?.request?.headers.get('Authorization'),
  ).toBe('Custom credential');
  const plain = FetchTransport.fromSettings({
    baseUrl: 'https://example.test',
  });
  await plain.transportResponse(spec);
  const auth = new StandardAuthenticationAdapter({});
  const missing = new FetchTransport('https://example.test', {
    requestAdapter: auth,
    responseAdapter: auth,
  });
  await expect(missing.transportResponse(spec)).rejects.toBeInstanceOf(
    RequestCancellationError,
  );
  expect(fetchMock.callHistory.calls()).toHaveLength(2);
  await missing.transportResponse({ ...spec, security: [] });
});

it('standard rejection stops despite failed feedback and preserves provider cancellation', async () => {
  for (const failure of [
    new TokenProviderError('temporary'),
    new RequestCancellationError('stop'),
    new DOMException('stop', 'AbortError'),
  ]) {
    fetchMock.hardReset().mockGlobal();
    let rejected = 0;
    let failAcquisition = false;
    const provider: TokenProvider = {
      identity: 'feedback',
      configure: () => ({ clientIdentity: 'client' }),
      acquire: async () => {
        if (failAcquisition) throw new TokenProviderError('temporary');
        return { accessToken: 'access' };
      },
      reject: async () => {
        rejected++;
        throw failure;
      },
    };
    const adapter = new StandardAuthenticationAdapter({ identity: provider });
    const transport = new FetchTransport('https://example.test', {
      requestAdapter: adapter,
      responseAdapter: adapter,
    });
    fetchMock.get(
      'https://example.test/value',
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
      },
      { name: 'value' },
    );
    if (failure instanceof TokenProviderError) {
      await expect(transport.transportResponse(spec)).rejects.toBeInstanceOf(
        RequestCancellationError,
      );
    } else {
      await expect(transport.transportResponse(spec)).rejects.toBe(failure);
    }
    expect(rejected).toBe(1);
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
    fetchMock.modifyRoute('value', { response: 403 });
    await expect(transport.transportResponse(spec)).rejects.toMatchObject({
      status: 403,
    });
    expect(rejected).toBe(1);
    failAcquisition = true;
    await expect(transport.transportResponse(spec)).rejects.toBeInstanceOf(
      TokenProviderError,
    );
    expect(fetchMock.callHistory.calls()).toHaveLength(2);
  }
});
