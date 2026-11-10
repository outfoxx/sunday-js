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

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import {
  FetchTransport,
  RequestAdapters,
  ResponseAdapters,
  RequestCancellationError,
  requestCancellation,
  chainRequestAdapters,
  chainResponseAdapters,
  copyRequest,
  copyResponse,
  StringSchema,
  SecurityBinding,
  TokenProvider,
  RefreshingHeaderTokenAuthorizingAdapter,
} from '../src';

const spec = { method: 'GET' as const, pathTemplate: '/value' };
const binding: SecurityBinding = {
  scheme: 'auth',
  provider: 'application',
  profile: 'external',
  flow: 'external',
  scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};
const reply = (streaming: boolean, text = 'body') =>
  new Response(streaming ? `data: ${text}\n\n` : JSON.stringify(text), {
    headers: {
      'Content-Type': streaming ? 'text/event-stream' : 'application/json',
    },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function perform(
  client: FetchTransport,
  streaming: boolean,
  signal?: AbortSignal,
  security?: readonly SecurityBinding[],
) {
  const request = { ...spec, signal, security };
  if (!streaming) return client.result(request, StringSchema);
  const iterator = client
    .eventStream(request, (_decoder, _event, _id, data) => data)
    [Symbol.asyncIterator]();
  try {
    return (await iterator.next()).value;
  } finally {
    await iterator.return?.();
  }
}

describe('native Fetch adapter execution', () => {
  it('retires obsolete native branches without cancelling or buffering the active upload', async () => {
    let cancelled = 0;
    const input = new Request('http://example.com/value', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('payload'));
          controller.close();
        },
        cancel() {
          cancelled++;
        },
      }),
      duplex: 'half',
    } as RequestInit);
    const copy = copyRequest(input);
    expect(input.bodyUsed || input.body!.locked).toBe(true);
    expect(await copy.text()).toBe('payload');
    expect(cancelled).toBe(0);
  });

  it('cancels an already-aborted raw request without awaiting producer cleanup', async () => {
    const abort = new AbortController();
    const reason = new RequestCancellationError('before execution');
    let cancelled: unknown;
    const request = new Request('http://example.com/value', {
      method: 'POST',
      signal: abort.signal,
      body: new ReadableStream({
        cancel(error) {
          cancelled = error;
          return new Promise(() => {});
        },
      }),
    });
    abort.abort(reason);
    const client = new FetchTransport('http://example.com', { logger: {} });
    await expect(client.transportResponse(request)).rejects.toBe(reason);
    expect(cancelled).toBe(reason);
  });

  beforeEach(() => {
    fetchMock.hardReset();
    fetchMock.mockGlobal();
  });
  afterEach(() => {
    fetchMock.hardReset();
  });

  it('keeps ordinary network failures eligible for SSE reconnection', async () => {
    let attempts = 0;
    fetchMock.get('https://api.example/value', () => {
      if (++attempts === 1) throw new TypeError('network unavailable');
      return reply(true);
    });
    const client = new FetchTransport('https://api.example', { logger: {} });
    expect(await perform(client, true)).toBe('body');
    expect(attempts).toBe(2);
  });

  for (const streaming of [false, true]) {
    const mode = streaming ? 'streaming' : 'buffered';
    it(`${mode}: runs flat independent chains once in order`, async () => {
      const calls: string[] = [];
      const first = {
        adapt(request: Request) {
          calls.push('request-1');
          return copyRequest(request, { headers: { 'X-Test': 'yes' } });
        },
      };
      const second = {
        adapt(request: Request) {
          calls.push('request-2');
          return request;
        },
      };
      const requests = chainRequestAdapters(first).chainTo(
        new RequestAdapters(second),
      );
      const responses = chainResponseAdapters({
        adapt(response: Response, request: Request) {
          calls.push('response-1');
          expect(request.headers.get('X-Test')).toBe('yes');
          return response;
        },
      }).chainTo(
        new ResponseAdapters({
          adapt(response) {
            calls.push('response-2');
            return response;
          },
        }),
      );
      expect(requests.adapters).toHaveLength(2);
      expect(responses.adapters).toHaveLength(2);
      fetchMock.get('https://api.example/value', () => {
        calls.push('fetch');
        return reply(streaming);
      });
      const client = new FetchTransport('https://api.example', {
        logger: {},
        requestAdapter: requests,
        responseAdapter: responses,
      });
      expect(await perform(client, streaming)).toBe('body');
      expect(calls).toEqual([
        'request-1',
        'request-2',
        'fetch',
        'response-1',
        'response-2',
      ]);
    });

    for (const inbound of [false, true]) {
      it(`${mode}: preserves adapter stop identity ${inbound ? 'after' : 'before'} Fetch`, async () => {
        const stop = new RequestCancellationError('stop');
        let later = false;
        fetchMock.get('https://api.example/value', () => reply(streaming));
        const client = new FetchTransport('https://api.example', {
          logger: {},
          requestAdapter: inbound
            ? undefined
            : chainRequestAdapters(
                {
                  adapt() {
                    throw stop;
                  },
                },
                {
                  adapt(r) {
                    later = true;
                    return r;
                  },
                },
              ),
          responseAdapter: !inbound
            ? undefined
            : chainResponseAdapters(
                {
                  adapt() {
                    throw stop;
                  },
                },
                {
                  adapt(r) {
                    later = true;
                    return r;
                  },
                },
              ),
        });
        await expect(perform(client, streaming)).rejects.toBe(stop);
        expect(later).toBe(false);
        expect(fetchMock.callHistory.calls()).toHaveLength(inbound ? 1 : 0);
      });
    }

    it(`${mode}: consumes and replaces a body before normal handling`, async () => {
      fetchMock.get('https://api.example/value', () => reply(streaming));
      const client = new FetchTransport('https://api.example', {
        logger: {},
        responseAdapter: {
          async adapt(response) {
            expect(await response.text()).toContain('body');
            return copyResponse(response, {
              body: streaming ? 'data: replacement\n\n' : '"replacement"',
            });
          },
        },
      });
      expect(await perform(client, streaming)).toBe('replacement');
    });

    it(`${mode}: preserves a body read stop instead of decoding or reconnecting`, async () => {
      const stop = new RequestCancellationError('body stopped');
      fetchMock.get('https://api.example/value', () => reply(streaming));
      const client = new FetchTransport('https://api.example', {
        logger: {},
        responseAdapter: {
          async adapt(response) {
            await response.body?.cancel();
            return copyResponse(response, {
              body: new ReadableStream({
                start(controller) {
                  controller.error(stop);
                },
              }),
            });
          },
        },
      });
      await expect(perform(client, streaming)).rejects.toBe(stop);
      expect(fetchMock.callHistory.calls()).toHaveLength(1);
    });

    it(`${mode}: cancels pending adapters promptly and cleans their late results`, async () => {
      const entered = deferred<void>();
      const pending = deferred<Response>();
      const abort = new AbortController();
      const reason = new Error('application cancellation');
      let discarded = false;
      fetchMock.get('https://api.example/value', () => reply(streaming));
      const client = new FetchTransport('https://api.example', {
        logger: {},
        responseAdapter: {
          async adapt(response) {
            await response.body?.cancel();
            entered.resolve();
            return pending.promise;
          },
        },
      });
      const result = perform(client, streaming, abort.signal);
      await entered.promise;
      abort.abort(reason);
      await expect(result).rejects.toBe(reason);
      pending.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              discarded = true;
            },
          }),
        ),
      );
      await Bun.sleep(0);
      expect(discarded).toBe(true);
    });

    for (const reason of [
      new Error('adapter cancellation'),
      null,
      0,
      false,
      '',
    ]) {
      for (const phase of [
        'request adapter',
        'response adapter',
        'body',
      ] as const) {
        it(`${mode}: preserves adapter-added abort reason ${String(reason)} during ${phase}`, async () => {
          const abort = new AbortController();
          const entered = deferred<void>();
          fetchMock.get('https://api.example/value', () => reply(streaming));
          const client = new FetchTransport('https://api.example', {
            logger: {},
            requestAdapter: chainRequestAdapters(
              {
                adapt: (request) =>
                  copyRequest(request, { signal: abort.signal }),
              },
              {
                adapt(request) {
                  if (phase !== 'request adapter') return request;
                  entered.resolve();
                  return new Promise<Request>(() => {});
                },
              },
            ),
            responseAdapter: {
              async adapt(response) {
                await response.body?.cancel();
                if (phase === 'response adapter') {
                  entered.resolve();
                  return new Promise<Response>(() => {});
                }
                return copyResponse(response, {
                  body: new ReadableStream({
                    pull() {
                      entered.resolve();
                    },
                  }),
                });
              },
            },
          });
          const result = perform(client, streaming);
          await entered.promise;
          abort.abort(reason);
          await expect(result).rejects.toBe(reason);
          expect(fetchMock.callHistory.calls()).toHaveLength(
            phase === 'request adapter' ? 0 : 1,
          );
        });
      }
    }

    it(`${mode}: invalidates rejected tokens even after the retry budget is spent`, async () => {
      const acquired: string[] = [],
        rejected: string[] = [];
      const provider: TokenProvider = {
        identity: 'external',
        configure: () => ({ clientIdentity: 'test' }),
        async acquire() {
          const accessToken = `token-${acquired.length}`;
          acquired.push(accessToken);
          return { accessToken };
        },
        async reject(_request, token) {
          rejected.push(token);
          return true;
        },
      };
      fetchMock.get('https://api.example/value', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
      });
      const client = new FetchTransport('https://api.example', {
        logger: {},
        tokenProviders: { application: provider },
      });
      await expect(
        perform(client, streaming, undefined, [binding]),
      ).rejects.toMatchObject({ status: 401 });
      expect(acquired).toEqual(['token-0', 'token-1']);
      expect(rejected).toEqual(acquired);
      expect(fetchMock.callHistory.calls()).toHaveLength(2);
    });

    it(`${mode}: composes authentication feedback without implicit token retries`, async () => {
      let renewals = 0,
        observations = 0,
        calls = 0;
      const auth = new RefreshingHeaderTokenAuthorizingAdapter(async () => ({
        token: `token-${++renewals}`,
        expires: new Date(Date.now() + 60000),
      }));
      fetchMock.get('https://api.example/value', () =>
        ++calls === 1
          ? new Response(null, {
              status: 401,
              headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
            })
          : reply(streaming),
      );
      const client = new FetchTransport('https://api.example', {
        logger: {},
        requestAdapter: auth,
        responseAdapter: chainResponseAdapters(auth, {
          adapt(r) {
            observations++;
            return r;
          },
        }),
      });
      await expect(perform(client, streaming)).rejects.toMatchObject({
        status: 401,
      });
      expect(calls).toBe(1);
      expect(await perform(client, streaming)).toBe('body');
      expect([renewals, observations]).toEqual([2, 2]);
    });
  }

  it('exports once without implicitly installing response capabilities', async () => {
    let requests = 0,
      responses = 0;
    class Both {
      adapt(request: Request): Request;
      adapt(response: Response, request: Request): Response;
      adapt(value: Request | Response, request?: Request): Request | Response {
        if (request) responses++;
        else requests++;
        return value;
      }
    }
    fetchMock.get('https://api.example/value', 'done');
    const client = new FetchTransport('https://api.example', {
      requestAdapter: new Both(),
    });
    const request = await client.transportRequest(spec);
    await fetch(request);
    expect([requests, responses]).toEqual([1, 0]);
    await client.transportResponse(spec);
    expect([requests, responses]).toEqual([2, 0]);
  });

  it('retains signals added by earlier request adapters', async () => {
    const abort = new AbortController();
    const entered = deferred<void>();
    const reason = { user: 'cancelled' };
    const client = new FetchTransport('https://api.example', {
      requestAdapter: chainRequestAdapters(
        {
          adapt(r) {
            return copyRequest(r, { signal: abort.signal });
          },
        },
        {
          adapt(r) {
            return new Request(r.url);
          },
        },
        {
          adapt() {
            entered.resolve();
            return new Promise<Request>(() => {});
          },
        },
      ),
    });
    const result = client.transportResponse(spec);
    await entered.promise;
    abort.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it('passes branded application errors without requiring Error inheritance from Sunday', async () => {
    const stop = Object.assign(new TypeError('application'), {
      [requestCancellation]: true,
    });
    const client = new FetchTransport('https://api.example', {
      requestAdapter: {
        adapt() {
          throw stop;
        },
      },
    });
    await expect(client.transportResponse(spec)).rejects.toBe(stop);
  });

  it('notifies a provider for an unsafe request without replaying or blaming replaced credentials', async () => {
    for (const replace of [false, true]) {
      let rejected = 0;
      fetchMock.clearHistory();
      fetchMock.removeRoutes();
      fetchMock.post('https://api.example/value', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error=invalid_token' },
      });
      const client = new FetchTransport('https://api.example', {
        tokenProviders: {
          application: {
            identity: 'external',
            configure: () => ({ clientIdentity: 'test' }),
            acquire: async () => ({ accessToken: 'original' }),
            reject: async () => {
              rejected++;
              return true;
            },
          },
        },
        requestAdapter: {
          adapt(request) {
            if (replace)
              request.headers.set('Authorization', 'Bearer replacement');
            return request;
          },
        },
      });
      await expect(
        client.transportResponse({
          method: 'POST',
          pathTemplate: '/value',
          security: [binding],
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(rejected).toBe(replace ? 0 : 1);
      expect(fetchMock.callHistory.calls()).toHaveLength(1);
    }
  });

  it('preserves metadata and settings without teeing or consuming bodies', async () => {
    const request = new Request('https://api.example/value', {
      method: 'POST',
      body: 'body',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'manual',
    });
    const copied = copyRequest(request, { headers: { 'X-Copied': 'yes' } });
    expect([
      copied.method,
      copied.cache,
      copied.credentials,
      copied.redirect,
    ]).toEqual([
      request.method,
      request.cache,
      request.credentials,
      request.redirect,
    ]);
    expect(await copied.text()).toBe('body');
    const original = new Response('body', {
      status: 201,
      headers: { 'X-Original': 'yes' },
    });
    Object.defineProperty(original, 'url', {
      value: 'https://api.example/value',
    });
    Object.defineProperty(original, 'redirected', { value: true });
    const response = copyResponse(original, { status: 202 });
    expect([response.url, response.redirected, response.status]).toEqual([
      original.url,
      true,
      202,
    ]);
    expect(await response.text()).toBe('body');
  });
});
