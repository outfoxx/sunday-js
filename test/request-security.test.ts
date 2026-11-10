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

import { authenticationAdapters } from '../src/authentication-adapter.js';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fetchMock from 'fetch-mock';
import {
  FetchTransport,
  SecurityBinding,
  TokenManager,
  TokenProvider,
  TokenProviderError,
  RequestCancellationError,
} from '../src';
import {
  authorizeRequest,
  canRecoverAuthentication,
  redactSecurityResponse,
} from '../src/request-security';

const binding: SecurityBinding = {
  scheme: 'token',
  provider: 'identity',
  profile: 'external',
  flow: 'clientCredentials',
  scopes: ['read'],
  tokenUrl: 'https://identity.example/token',
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

function transport() {
  let acquisitions = 0;
  let refreshes = 0;
  const provider: TokenProvider = {
    identity: 'provider',
    configure: () => ({ clientIdentity: 'client' }),
    acquire: async () => {
      acquisitions++;
      return { accessToken: 'first', refreshToken: 'refresh' };
    },
    refresh: async () => {
      refreshes++;
      return { accessToken: 'second', refreshToken: 'rotated' };
    },
  };
  return {
    client: new FetchTransport('https://api.example', {
      ...authenticationAdapters(
        { identity: new TokenManager(provider) },
        undefined,
        undefined,
      ),
    }),
    counts: () => [acquisitions, refreshes],
  };
}

describe('operation security', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('adds credentials only to selected operations and refreshes on the next explicit call', async () => {
    const { client, counts } = transport();
    const headers: (string | null)[] = [];
    fetchMock.get('https://api.example/items', (call) => {
      headers.push(new Headers(call.options.headers).get('Authorization'));
      return headers.length === 1
        ? {
            status: 401,
            headers: {
              'WWW-Authenticate': 'Bearer realm="api", error="invalid_token"',
            },
          }
        : 204;
    });
    await expect(
      client.result({
        method: 'GET',
        pathTemplate: '/items',
        security: [binding],
      }),
    ).rejects.toMatchObject({ status: 401 });
    await client.result({
      method: 'GET',
      pathTemplate: '/items',
      security: [binding],
    });
    expect(headers).toEqual(['Bearer first', 'Bearer second']);
    expect(counts()).toEqual([1, 1]);
    fetchMock.get('https://api.example/public', (call) => {
      expect(new Headers(call.options.headers).has('Authorization')).toBe(
        false,
      );
      return 204;
    });
    await client.result({
      method: 'GET',
      pathTemplate: '/public',
      security: [],
    });
    expect(counts()).toEqual([1, 1]);
  });

  it('does not implicitly retry any authentication response', async () => {
    for (const [method, status, attempts] of [
      ['GET', 403, 1],
      ['POST', 401, 1],
      ['GET', 401, 1],
    ] as const) {
      fetchMock.hardReset().mockGlobal();
      const { client } = transport();
      let calls = 0;
      fetchMock.route('https://api.example/items', () => {
        calls++;
        return {
          status,
          headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
        };
      });
      await expect(
        client.result({ method, pathTemplate: '/items', security: [binding] }),
      ).rejects.toMatchObject({ status });
      expect(calls).toBe(attempts);
    }
  });

  it('exports credentials once and delegates execution and recovery to the consumer', async () => {
    const { client, counts } = transport();
    const request = await client.transportRequest({
      method: 'GET',
      pathTemplate: '/items',
      security: [binding],
    });
    fetchMock.get('https://api.example/items', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    });
    expect((await fetch(request)).status).toBe(401);
    expect(counts()).toEqual([1, 0]);
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
  });

  it('rejects missing bindings and conflicting headers before sending', async () => {
    const client = new FetchTransport(
      'https://api.example',
      authenticationAdapters({}),
    );
    await expect(
      client.transportRequest({
        method: 'GET',
        pathTemplate: '/items',
        security: [binding],
      }),
    ).rejects.toBeInstanceOf(RequestCancellationError);
    const configured = transport().client;
    await expect(
      configured.transportRequest({
        method: 'GET',
        pathTemplate: '/items',
        security: [binding],
        headers: { Authorization: 'application' },
      }),
    ).rejects.toBeInstanceOf(RequestCancellationError);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('keeps AND credentials together and redacts query credentials from response diagnostics', async () => {
    const manager = new TokenManager({
      identity: {
        identity: 'static',
        configure: () => ({ clientIdentity: 'client' }),
        acquire: async () => ({ accessToken: 'secret' }),
      },
    });
    const query = {
      ...binding,
      transport: { location: 'query' as const, name: 'api-key' },
    };
    const cookie = {
      ...binding,
      transport: { location: 'cookie' as const, name: 'session' },
    };
    const authorized = await authorizeRequest(
      new Request('https://api.example/items?count=1', {
        method: 'POST',
        body: 'payload',
        headers: { Cookie: 'other=kept', 'Content-Type': 'text/plain' },
      }),
      [binding, query, cookie],
      { identity: manager },
    );
    expect(authorized.request.headers.get('Authorization')).toBe(
      'Bearer secret',
    );
    expect(authorized.request.headers.get('Cookie')).toBe(
      'other=kept; session=secret',
    );
    expect(new URL(authorized.request.url).searchParams.get('api-key')).toBe(
      'secret',
    );
    expect(await authorized.request.text()).toBe('payload');
    const response = new Response('', { status: 403 });
    Object.defineProperty(response, 'url', { value: authorized.request.url });
    const redacted = redactSecurityResponse(response, [query]);
    expect(new URL(redacted.url).searchParams.get('api-key')).toBe(
      '[redacted]',
    );
    expect(redacted.url).not.toContain('secret');
  });

  it('redacts status-zero response metadata without reconstructing or cloning it', () => {
    const response = Response.error();
    Object.defineProperty(response, 'url', {
      value: 'https://api.example/items?api-key=secret&count=1',
      configurable: true,
    });
    const clone = spyOn(response, 'clone');
    const query = {
      ...binding,
      transport: { location: 'query' as const, name: 'api-key' },
    };
    const result = redactSecurityResponse(response, [query]);
    expect(result).toBe(response);
    expect(result.status).toBe(0);
    expect(result.type).toBe('error');
    expect(result.body).toBeNull();
    expect(new URL(result.url).searchParams.get('api-key')).toBe('[redacted]');
    expect(new URL(result.url).searchParams.get('count')).toBe('1');
    expect(clone).not.toHaveBeenCalled();
  });

  it('retains the original response when no query credential needs redaction', () => {
    const response = new Response('body');
    Object.defineProperty(response, 'url', {
      value: 'https://api.example/items?count=1',
    });
    const query = {
      ...binding,
      transport: { location: 'query' as const, name: 'api-key' },
    };
    expect(redactSecurityResponse(response, [query])).toBe(response);
  });

  it('preserves unrelated raw query fields and rejects unsafe credential headers', async () => {
    const manager = new TokenManager({
      identity: {
        identity: 'static',
        configure: () => ({ clientIdentity: 'client' }),
        acquire: async () => ({ accessToken: 'secret value' }),
      },
    });
    const query = {
      ...binding,
      transport: { location: 'query' as const, name: 'api-key' },
    };
    const authorized = await authorizeRequest(
      new Request('https://api.example/items?signed=a%20b&plus=a+b&escape=%2f'),
      [query],
      { identity: manager },
    );
    expect(authorized.request.url).toBe(
      'https://api.example/items?signed=a%20b&plus=a+b&escape=%2f&api-key=secret%20value',
    );
    const response = new Response(null, { status: 403 });
    Object.defineProperty(response, 'url', { value: authorized.request.url });
    expect(redactSecurityResponse(response, [query]).url).toBe(
      'https://api.example/items?signed=a%20b&plus=a+b&escape=%2f&api-key=%5Bredacted%5D',
    );
    const unsafe = new TokenManager({
      identity: {
        identity: 'unsafe',
        configure: () => ({ clientIdentity: 'client' }),
        acquire: async () => ({ accessToken: 'secret\r\nInjected: value' }),
      },
    });
    await expect(
      authorizeRequest(new Request('https://api.example'), [binding], {
        identity: unsafe,
      }),
    ).rejects.toBeInstanceOf(TokenProviderError);
  });

  it('does not confuse parameters belonging to another authentication challenge', async () => {
    const { client } = transport();
    const request = await client.transportRequest({
      method: 'GET',
      pathTemplate: '/items',
      security: [binding],
    });
    const authorized = { request, bindings: [binding], leases: [] };
    for (const challenge of [
      'Bearer realm="api", Basic error="invalid_token"',
      'Bearer error="insufficient_scope"',
      'Bearer realm="error=invalid_token"',
      'Bearer error="invalid_token',
      'Basic error="invalid_token"',
    ])
      expect(
        canRecoverAuthentication(
          authorized.request,
          new Response(null, {
            status: 401,
            headers: { 'WWW-Authenticate': challenge },
          }),
        ),
      ).toBe(false);
    expect(
      canRecoverAuthentication(
        authorized.request,
        new Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Basic realm="error, realm", Bearer realm="other, realm", error="invalid_token"',
          },
        }),
      ),
    ).toBe(true);
  });
  it('does not recover an error belonging to a bare new challenge or an unknown error code', () => {
    const authorized = {
      request: new Request('https://api.example'),
      bindings: [binding],
      leases: [],
    };
    for (const value of [
      'Bearer realm="api", Basic, error="invalid_token"',
      'Bearer error="INVALID_TOKEN"',
    ]) {
      const response = new Response(null, {
        status: 401,
        headers: { 'WWW-Authenticate': value },
      });
      expect(canRecoverAuthentication(authorized.request, response)).toBe(
        false,
      );
    }
  });

  it('returns a rejected event connection without an authentication retry', async () => {
    const { client, counts } = transport();
    fetchMock.get('https://api.example/events', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
    });
    const source = client.eventSource({
      method: 'GET',
      pathTemplate: '/events',
      security: [binding],
    });
    await new Promise<void>((resolve) => {
      source.onerror = () => {
        source.close();
        resolve();
      };
      source.connect();
    });
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
    expect(counts()).toEqual([1, 0]);
  });

  it('terminates event acquisition failures without reconnecting', async () => {
    const client = new FetchTransport(
      'https://api.example',
      authenticationAdapters({}),
    );
    const source = client.eventSource({
      method: 'GET',
      pathTemplate: '/events',
      security: [binding],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        source.close();
        reject(new Error('Provider failure did not terminate'));
      }, 1000);
      source.onerror = () => {
        clearTimeout(timeout);
        resolve();
      };
      source.connect();
    });
    expect(source.readyState).toBe(source.CLOSED);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('closing events cancels initial credential acquisition before any fetch', async () => {
    let started!: () => void;
    let cancelled!: () => void;
    const acquiring = new Promise<void>((resolve) => {
      started = resolve;
    });
    const stopped = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const provider: TokenProvider = {
      identity: 'cancellable',
      configure: () => ({ clientIdentity: 'client' }),
      acquire: (_request, signal) =>
        new Promise((_resolve, reject) => {
          started();
          signal.addEventListener(
            'abort',
            () => {
              cancelled();
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    };
    const client = new FetchTransport('https://api.example', {
      ...authenticationAdapters(
        { identity: new TokenManager(provider) },
        undefined,
        undefined,
      ),
    });
    const source = client.eventSource({
      method: 'GET',
      pathTemplate: '/events',
      security: [binding],
    });
    source.connect();
    await acquiring;
    source.close();
    await stopped;
    expect(source.readyState).toBe(source.CLOSED);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('reconnects events after a temporary credential outage', async () => {
    let attempts = 0;
    const provider: TokenProvider = {
      identity: 'intermittent',
      configure: () => ({ clientIdentity: 'client' }),
      acquire: () => {
        if (++attempts === 1)
          return Promise.reject(new TokenProviderError('temporary'));
        return Promise.resolve({ accessToken: 'recovered' });
      },
    };
    fetchMock.get('https://api.example/events', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: 'data: recovered\n\n',
    });
    const client = new FetchTransport('https://api.example', {
      ...authenticationAdapters(
        { identity: new TokenManager(provider) },
        undefined,
        undefined,
      ),
    });
    const source = client.eventSource({
      method: 'GET',
      pathTemplate: '/events',
      security: [binding],
    });
    await new Promise<void>((resolve) => {
      source.onmessage = (event) => {
        expect(event.data).toBe('recovered');
        source.close();
        resolve();
      };
      source.connect();
    });
    expect(attempts).toBe(2);
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
  });

  it('uses external credentials once per attempt and observes rotation and logout', async () => {
    let token: string | undefined = 'first';
    let acquired = 0;
    let rejected = 0;
    const provider: TokenProvider = {
      identity: 'external',
      configure: () => ({ clientIdentity: 'client', grantIdentity: 'session' }),
      acquire: async () => {
        acquired++;
        if (!token) throw new TokenProviderError();
        return { accessToken: token };
      },
      reject: async (_request, old) => {
        rejected++;
        if (token === old) token = 'renewed';
        return true;
      },
    };
    const client = new FetchTransport('https://api.example', {
      ...authenticationAdapters({ identity: provider }, undefined, undefined),
    });
    const received: (string | null)[] = [];
    fetchMock.get('https://api.example/items', (call) => {
      const value = new Headers(call.options.headers).get('Authorization');
      received.push(value);
      return value === 'Bearer rejected'
        ? {
            status: 401,
            headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
          }
        : 204;
    });
    const spec = {
      method: 'GET' as const,
      pathTemplate: '/items',
      security: [binding],
    };
    await client.result(spec);
    token = 'replacement';
    await client.result(spec);
    token = 'rejected';
    await expect(client.result(spec)).rejects.toMatchObject({ status: 401 });
    await client.result(spec);
    expect([acquired, rejected]).toEqual([4, 1]);
    expect(received).toEqual([
      'Bearer first',
      'Bearer replacement',
      'Bearer rejected',
      'Bearer renewed',
    ]);
    token = undefined;
    await expect(client.result(spec)).rejects.toBeInstanceOf(
      RequestCancellationError,
    );
    expect(received).toHaveLength(4);
  });

  it('does not replay a direct provider without rejection support', async () => {
    let acquired = 0;
    const provider: TokenProvider = {
      identity: 'external',
      configure: () => ({ clientIdentity: 'client' }),
      acquire: async () => {
        acquired++;
        return { accessToken: 'same' };
      },
    };
    fetchMock.get('https://api.example/items', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
    });
    const client = new FetchTransport('https://api.example', {
      ...authenticationAdapters({ identity: provider }, undefined, undefined),
    });
    await expect(
      client.result({
        method: 'GET',
        pathTemplate: '/items',
        security: [binding],
      }),
    ).rejects.toBeInstanceOf(RequestCancellationError);
    expect(acquired).toBe(1);
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
  });

  it('closes rejected responses and sanitizes errors when provider recovery fails', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
      },
    );
    const provider: TokenProvider = {
      identity: 'external',
      configure: () => ({ clientIdentity: 'client' }),
      acquire: async () => ({ accessToken: 'rejected' }),
      reject: async () => {
        throw new Error('private-provider-detail');
      },
    };
    const client = new FetchTransport('https://api.example', {
      ...authenticationAdapters({ identity: provider }, undefined, undefined),
    });
    const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      await expect(
        client.result({
          method: 'GET',
          pathTemplate: '/items',
          security: [binding],
        }),
      ).rejects.toBeInstanceOf(RequestCancellationError);
      expect(cancelled).toBe(true);
    } finally {
      fetch.mockRestore();
    }
  });
});
