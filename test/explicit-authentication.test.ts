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

import { beforeEach, describe, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import {
  AuthenticationAdapter,
  AuthorizationRequiredError,
  BearerTokenRejectionAdapter,
  ClientSettings,
  FetchTransport,
  RequestCancellationError,
  authenticationAdapters,
  type SecurityBinding,
  type TokenProvider,
} from '../src';

const binding: SecurityBinding = {
  scheme: 'identity',
  provider: 'identity',
  flow: 'external',
  scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};
const spec = {
  method: 'GET' as const,
  pathTemplate: '/value',
  security: [binding],
};

function fixture() {
  let acquired = 0,
    rejected = 0;
  const provider: TokenProvider = {
    identity: 'fixture',
    configure: () => ({ clientIdentity: 'fixture' }),
    acquire: async () => {
      acquired++;
      return { accessToken: 'fixture' };
    },
    reject: async () => {
      rejected++;
      return true;
    },
  };
  const settings = new ClientSettings(
    'https://example.test',
    { read: [binding] },
    { identity: { kind: 'provider', provider } },
  );
  return { provider, settings, counts: () => [acquired, rejected] };
}

describe('explicit authentication', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('settings and native requests install no auth; explicit adapter composition retains feedback', async () => {
    const { settings, counts } = fixture();
    let requests = 0,
      responses = 0;
    const requestAdapter = {
      adapt: async (request: Request) => {
        requests++;
        return request;
      },
    };
    const responseAdapter = {
      adapt: async (response: Response) => {
        responses++;
        return response;
      },
    };
    const plain = FetchTransport.fromSettings(settings, {
      adapter: requestAdapter,
    });
    expect(
      (await plain.transportRequest(spec)).headers.has('Authorization'),
    ).toBe(false);
    expect(counts()).toEqual([0, 0]);
    expect(requests).toBe(1);
    fetchMock.get('https://example.test/value', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
    });
    const managed = FetchTransport.fromSettings(
      settings,
      authenticationAdapters(
        settings.tokenProviders,
        requestAdapter,
        responseAdapter,
      ),
    );
    await expect(managed.transportResponse(spec)).rejects.toMatchObject({
      status: 401,
    });
    expect(counts()).toEqual([1, 1]);
    expect([requests, responses]).toEqual([2, 1]);
    const exported = await managed.transportRequest(spec);
    await expect(managed.transportResponse(exported)).rejects.toMatchObject({
      status: 401,
    });
    expect(counts()).toEqual([2, 1]);
  });

  it('fresh authorization is an unconditional SSE stop signal', async () => {
    const { provider } = fixture();
    let attempts = 0;
    const failure = new AuthorizationRequiredError();
    expect(failure).toBeInstanceOf(RequestCancellationError);
    provider.acquire = async () => {
      attempts++;
      throw failure;
    };
    const source = new FetchTransport(
      'https://example.test',
      authenticationAdapters({ identity: provider }),
    ).eventSource(spec);
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('No terminal error')),
          1000,
        );
        source.onerror = () => {
          clearTimeout(timeout);
          resolve();
        };
        source.connect();
      });
      expect(source.readyState).toBe(source.CLOSED);
      expect(attempts).toBe(1);
      expect(fetchMock.callHistory.calls()).toHaveLength(0);
    } finally {
      source.close();
    }
  });

  it('rejection feedback requires the matching explicit response adapter', async () => {
    const { provider, counts } = fixture();
    const requestAdapter = new AuthenticationAdapter({ identity: provider });
    fetchMock.get('https://example.test/value', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
    });
    const transport = new FetchTransport('https://example.test', {
      requestAdapter,
    });
    await expect(transport.transportResponse(spec)).rejects.toMatchObject({
      status: 401,
    });
    expect(counts()).toEqual([1, 0]);
  });

  it('the optional stop adapter filters challenges without reading or replaying bodies', async () => {
    const adapter = new BearerTokenRejectionAdapter();
    for (const status of [200, 401, 403])
      for (const challenge of [
        'Bearer error=invalid_token',
        'Basic error=invalid_token',
        'Bearer error=insufficient_scope',
      ]) {
        const request = new Request('https://example.test', {
          method: 'POST',
          body: 'request',
          headers: { Authorization: 'Bearer fixture' },
        });
        const response = new Response('response', {
          status,
          headers: { 'WWW-Authenticate': challenge },
        });
        if (status === 401 && challenge === 'Bearer error=invalid_token') {
          for (let n = 0; n < 2; n++)
            await expect(
              adapter.adapt(response, request),
            ).rejects.toBeInstanceOf(RequestCancellationError);
        } else expect(await adapter.adapt(response, request)).toBe(response);
        request.headers.delete('Authorization');
        expect(await adapter.adapt(response, request)).toBe(response);
        expect(request.bodyUsed).toBe(false);
        expect(response.bodyUsed).toBe(false);
      }
  });
});
