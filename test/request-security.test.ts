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
import { FetchTransport, SecurityBinding, TokenManager, TokenProvider, TokenProviderError } from '../src';
import { authorizeRequest, canRecoverAuthentication, redactSecurityResponse } from '../src/request-security';

const binding: SecurityBinding = {
  scheme: 'token', provider: 'identity', profile: 'external', flow: 'clientCredentials',
  scopes: ['read'], tokenUrl: 'https://identity.example/token',
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

function transport() {
  let acquisitions = 0;
  let refreshes = 0;
  const provider: TokenProvider = {
    identity: 'provider', configure: () => ({ clientIdentity: 'client' }),
    acquire: async () => { acquisitions++; return { accessToken: 'first', refreshToken: 'refresh' }; },
    refresh: async () => { refreshes++; return { accessToken: 'second', refreshToken: 'rotated' }; },
  };
  return {
    client: new FetchTransport('https://api.example', { tokenManager: new TokenManager({ identity: provider }) }),
    counts: () => [acquisitions, refreshes],
  };
}

describe('operation security', () => {
  beforeEach(() => { fetchMock.hardReset().mockGlobal(); });

  it('adds credentials only to selected operations and recovers invalid tokens once', async () => {
    const { client, counts } = transport();
    const headers: (string | null)[] = [];
    fetchMock.get('https://api.example/items', call => {
      headers.push(new Headers(call.options.headers).get('Authorization'));
      return headers.length === 1 ? { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="api", error="invalid_token"' } } : 204;
    });
    await client.result({ method: 'GET', pathTemplate: '/items', security: [binding] });
    expect(headers).toEqual(['Bearer first', 'Bearer second']);
    expect(counts()).toEqual([1, 1]);
    fetchMock.get('https://api.example/public', call => {
      expect(new Headers(call.options.headers).has('Authorization')).toBe(false);
      return 204;
    });
    await client.result({ method: 'GET', pathTemplate: '/public', security: [] });
    expect(counts()).toEqual([1, 1]);
  });

  it('does not retry forbidden or unsafe requests and caps repeated invalid-token responses', async () => {
    for (const [method, status, attempts] of [['GET', 403, 1], ['POST', 401, 1], ['GET', 401, 2]] as const) {
      fetchMock.hardReset().mockGlobal();
      const { client } = transport();
      let calls = 0;
      fetchMock.route('https://api.example/items', () => {
        calls++;
        return { status, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } };
      });
      await expect(client.result({ method, pathTemplate: '/items', security: [binding] })).rejects.toMatchObject({ status });
      expect(calls).toBe(attempts);
    }
  });

  it('refreshes credentials for a native request executed again', async () => {
    const { client, counts } = transport();
    const request = await client.transportRequest({ method: 'GET', pathTemplate: '/items', security: [binding] });
    let calls = 0;
    fetchMock.get('https://api.example/items', call => {
      calls++;
      const header = new Headers(call.options.headers).get('Authorization');
      if (calls === 1) return { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } };
      expect(header).toBe('Bearer second');
      return 204;
    });
    await client.transportResponse(request);
    await client.transportResponse(request);
    expect(counts()).toEqual([1, 1]);
    expect(calls).toBe(3);
  });

  it('rejects missing bindings and conflicting headers before sending', async () => {
    const client = new FetchTransport('https://api.example');
    await expect(client.transportRequest({ method: 'GET', pathTemplate: '/items', security: [binding] })).rejects.toBeInstanceOf(TokenProviderError);
    const configured = transport().client;
    await expect(configured.transportRequest({
      method: 'GET', pathTemplate: '/items', security: [binding], headers: { Authorization: 'application' },
    })).rejects.toBeInstanceOf(TokenProviderError);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('keeps AND credentials together and redacts query credentials from response diagnostics', async () => {
    const manager = new TokenManager({ identity: {
      identity: 'static', configure: () => ({ clientIdentity: 'client' }), acquire: async () => ({ accessToken: 'secret' }),
    } });
    const query = { ...binding, transport: { location: 'query' as const, name: 'api-key' } };
    const cookie = { ...binding, transport: { location: 'cookie' as const, name: 'session' } };
    const authorized = await authorizeRequest(new Request('https://api.example/items?count=1', {
      method: 'POST', body: 'payload', headers: { Cookie: 'other=kept', 'Content-Type': 'text/plain' },
    }), [binding, query, cookie], manager);
    expect(authorized.request.headers.get('Authorization')).toBe('Bearer secret');
    expect(authorized.request.headers.get('Cookie')).toBe('other=kept; session=secret');
    expect(new URL(authorized.request.url).searchParams.get('api-key')).toBe('secret');
    expect(await authorized.request.text()).toBe('payload');
    const response = new Response('', { status: 403 });
    Object.defineProperty(response, 'url', { value: authorized.request.url });
    const redacted = redactSecurityResponse(response, [query]);
    expect(new URL(redacted.url).searchParams.get('api-key')).toBe('[redacted]');
    expect(redacted.url).not.toContain('secret');
  });

  it('preserves unrelated raw query fields and rejects unsafe credential headers', async () => {
    const manager = new TokenManager({ identity: {
      identity: 'static', configure: () => ({ clientIdentity: 'client' }), acquire: async () => ({ accessToken: 'secret value' }),
    } });
    const query = { ...binding, transport: { location: 'query' as const, name: 'api-key' } };
    const authorized = await authorizeRequest(new Request('https://api.example/items?signed=a%20b&plus=a+b&escape=%2f'), [query], manager);
    expect(authorized.request.url).toBe('https://api.example/items?signed=a%20b&plus=a+b&escape=%2f&api-key=secret%20value');
    const response = new Response(null, { status: 403 });
    Object.defineProperty(response, 'url', { value: authorized.request.url });
    expect(redactSecurityResponse(response, [query]).url).toBe('https://api.example/items?signed=a%20b&plus=a+b&escape=%2f&api-key=%5Bredacted%5D');
    const unsafe = new TokenManager({ identity: {
      identity: 'unsafe', configure: () => ({ clientIdentity: 'client' }), acquire: async () => ({ accessToken: 'secret\r\nInjected: value' }),
    } });
    await expect(authorizeRequest(new Request('https://api.example'), [binding], unsafe)).rejects.toBeInstanceOf(TokenProviderError);
  });

  it('does not confuse parameters belonging to another authentication challenge', async () => {
    const { client } = transport();
    const request = await client.transportRequest({ method: 'GET', pathTemplate: '/items', security: [binding] });
    const authorized = { request, bindings: [binding], leases: [] };
    for (const challenge of [
      'Bearer realm="api", Basic error="invalid_token"',
      'Bearer error="insufficient_scope"', 'Bearer realm="error=invalid_token"',
      'Bearer error="invalid_token', 'Basic error="invalid_token"',
    ]) expect(canRecoverAuthentication(authorized, new Response(null, { status: 401, headers: { 'WWW-Authenticate': challenge } }))).toBe(false);
    expect(canRecoverAuthentication(authorized, new Response(null, { status: 401, headers: {
      'WWW-Authenticate': 'Basic realm="error, realm", Bearer realm="other, realm", error="invalid_token"',
    } }))).toBe(true);
  });
  it('does not recover an error belonging to a bare new challenge or an unknown error code', () => {
    const authorized = { request: new Request('https://api.example'), bindings: [binding], leases: [] };
    for (const value of ['Bearer realm="api", Basic, error="invalid_token"', 'Bearer error="INVALID_TOKEN"']) {
      const response = new Response(null, { status: 401, headers: { 'WWW-Authenticate': value } });
      expect(canRecoverAuthentication(authorized, response)).toBe(false);
    }
  });

  it('shares one authentication recovery across event reconnects', async () => {
    const { client, counts } = transport();
    const credentials: (string | null)[] = [];
    fetchMock.get('https://api.example/events', call => {
      credentials.push(new Headers(call.options.headers).get('Authorization'));
      expect(call.request?.redirect).toBe('manual');
      return credentials.length === 2
        ? { status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'retry: 1\ndata: first\n\n' }
        : { status: 401, headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' } };
    });
    const source = client.eventSource({ method: 'GET', pathTemplate: '/events', security: [binding] });
    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { source.close(); reject(new Error('Event recovery did not terminate')); }, 2000);
      source.onmessage = event => { messages.push(event.data); };
      source.onerror = event => { clearTimeout(timeout); if (messages.length === 0) reject((event as Event & { error: unknown }).error); else resolve(); };
      source.connect();
    });
    source.close();
    expect(messages).toEqual(['first']);
    expect(credentials).toEqual(['Bearer first', 'Bearer second', 'Bearer second']);
    expect(counts()).toEqual([1, 1]);
  });

  it('terminates event acquisition failures without reconnecting', async () => {
    const client = new FetchTransport('https://api.example');
    const source = client.eventSource({ method: 'GET', pathTemplate: '/events', security: [binding] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { source.close(); reject(new Error('Provider failure did not terminate')); }, 1000);
      source.onerror = () => { clearTimeout(timeout); resolve(); };
      source.connect();
    });
    expect(source.readyState).toBe(source.CLOSED);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('closing events cancels initial credential acquisition before any fetch', async () => {
    let started!: () => void;
    let cancelled!: () => void;
    const acquiring = new Promise<void>(resolve => { started = resolve; });
    const stopped = new Promise<void>(resolve => { cancelled = resolve; });
    const provider: TokenProvider = {
      identity: 'cancellable', configure: () => ({ clientIdentity: 'client' }),
      acquire: (_request, signal) => new Promise((_resolve, reject) => {
        started();
        signal.addEventListener('abort', () => { cancelled(); reject(signal.reason); }, { once: true });
      }),
    };
    const client = new FetchTransport('https://api.example', { tokenManager: new TokenManager({ identity: provider }) });
    const source = client.eventSource({ method: 'GET', pathTemplate: '/events', security: [binding] });
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
      identity: 'intermittent', configure: () => ({ clientIdentity: 'client' }),
      acquire: () => {
        if (++attempts === 1) return Promise.reject(new TokenProviderError('temporary'));
        return Promise.resolve({ accessToken: 'recovered' });
      },
    };
    fetchMock.get('https://api.example/events', { status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'data: recovered\n\n' });
    const client = new FetchTransport('https://api.example', { tokenManager: new TokenManager({ identity: provider }) });
    const source = client.eventSource({ method: 'GET', pathTemplate: '/events', security: [binding] });
    await new Promise<void>(resolve => {
      source.onmessage = event => { expect(event.data).toBe('recovered'); source.close(); resolve(); };
      source.connect();
    });
    expect(attempts).toBe(2);
    expect(fetchMock.callHistory.calls()).toHaveLength(1);
  });

});
