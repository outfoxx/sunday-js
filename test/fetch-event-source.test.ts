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

import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fetchMock from 'fetch-mock';
import { FetchEventSource, MediaType, Problem } from '../src';
import { unknownGet, unknownSet } from '../src/util/unknowns';
import { delayedResponse } from './fetch-mock-utils';

const waitForEvent = (
  setup: (resolve: () => void, reject: (error: Error) => void) => void,
  timeoutMs = 5000,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for event.'));
    }, timeoutMs);

    setup(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });

declare global {
  interface EventSourceEventMap {
    ['hello']: MessageEvent<string>;
  }
}

describe('FetchEventSource', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('ignores double connect', async () => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get(
      'http://example.com',
      {
        status: 503,
      },
    );

    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, _reject) => {
      eventSource.onmessage = () => {
        eventSource.close();
        resolve();
      };
      eventSource.onerror = (event) => {
        eventSource.close();
        _reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
      eventSource.connect();
    });
  });

  it('updates retry time', async () => {
    const eventStream = new TextEncoder().encode(
      'retry: 12345\nevent: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get(
      'http://example.com',
      {
        status: 503,
      },
    );

    const eventSource = new FetchEventSource('http://example.com');

    await waitForEvent((resolve, _reject) => {
      eventSource.onmessage = () => {
        eventSource.close();
        expect(eventSource.retryTime).toBe(12345);
        resolve();
      };
      eventSource.onerror = (event) => {
        eventSource.close();
        _reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
    });
  });

  it('uses the aligned exponential retry policy', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const calculateRetryTime = unknownGet<
      (retryAttempt: number, retryTime: number, retryMax: number) => number
    >(FetchEventSource, 'calculateRetryTime');

    expect(eventSource.retryTime).toBe(500);
    expect(
      Array.from({ length: 7 }, (_, retryAttempt) =>
        calculateRetryTime(retryAttempt, eventSource.retryTime, 15000),
      ),
    ).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000]);
  });

  it('resets retry escalation after a successful connection', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const timeoutSet = spyOn(globalThis, 'setTimeout');
    const receivedHeaders = unknownGet<(response: Response) => void>(
      eventSource,
      'receivedHeaders',
    ).bind(eventSource);
    const receivedComplete = unknownGet<() => void>(
      eventSource,
      'receivedComplete',
    ).bind(eventSource);

    unknownSet(eventSource, 'retryAttempt', 5);
    eventSource.readyState = eventSource.CONNECTING;
    receivedHeaders(new Response());
    receivedComplete();

    expect(timeoutSet).toHaveBeenCalledWith(expect.any(Function), 500);
    eventSource.close();
    timeoutSet.mockRestore();
  });

  it('escalates retry delays across consecutive connection failures', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const timeoutSet = spyOn(globalThis, 'setTimeout');
    const receivedError = unknownGet<(error: unknown) => void>(
      eventSource,
      'receivedError',
    ).bind(eventSource);

    eventSource.readyState = eventSource.CONNECTING;
    receivedError(new TypeError('Network failure'));
    receivedError(new TypeError('Network failure'));

    expect(timeoutSet).toHaveBeenNthCalledWith(1, expect.any(Function), 500);
    expect(timeoutSet).toHaveBeenNthCalledWith(2, expect.any(Function), 1000);
    eventSource.close();
    timeoutSet.mockRestore();
  });

  it('accepts server reconnect and keepalive controls', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const dispatchParsedEvent = unknownGet<(eventInfo: object) => void>(
      eventSource,
      'dispatchParsedEvent',
    ).bind(eventSource);

    eventSource.readyState = eventSource.OPEN;
    dispatchParsedEvent({
      retry: '250',
      'retry-max': '2000',
      keepalive: '2000',
    });

    expect(eventSource.retryTime).toBe(250);
    expect(unknownGet<number>(eventSource, 'internalRetryMax')).toBe(2000);
    expect(unknownGet<number>(eventSource, 'eventTimeout')).toBe(6000);
    expect(unknownGet(eventSource, 'eventTimeoutCheckHandle')).toBeDefined();

    dispatchParsedEvent({ 'retry-max': '0' });
    expect(unknownGet<number>(eventSource, 'internalRetryMax')).toBe(2000);

    eventSource.close();
  });

  it('applies a minimum keepalive timeout', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const intervalSet = spyOn(globalThis, 'setInterval');
    const dispatchParsedEvent = unknownGet<(eventInfo: object) => void>(
      eventSource,
      'dispatchParsedEvent',
    ).bind(eventSource);

    eventSource.readyState = eventSource.OPEN;
    dispatchParsedEvent({ keepalive: '100' });

    expect(unknownGet<number>(eventSource, 'eventTimeout')).toBe(1000);
    expect(intervalSet).toHaveBeenCalledWith(expect.any(Function), 1000);

    eventSource.close();
    intervalSet.mockRestore();
  });

  it('prefers an explicit event timeout over keepalive controls', () => {
    const eventSource = new FetchEventSource('http://example.com', {
      eventTimeout: 750,
    });
    const dispatchParsedEvent = unknownGet<(eventInfo: object) => void>(
      eventSource,
      'dispatchParsedEvent',
    ).bind(eventSource);

    dispatchParsedEvent({ keepalive: '2000' });

    expect(unknownGet<number>(eventSource, 'eventTimeout')).toBe(750);
  });

  it('ignores invalid reconnect and keepalive controls', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const dispatchParsedEvent = unknownGet<(eventInfo: object) => void>(
      eventSource,
      'dispatchParsedEvent',
    ).bind(eventSource);

    dispatchParsedEvent({
      retry: '250ms',
      'retry-max': '0',
      keepalive: '0',
    });

    expect(eventSource.retryTime).toBe(500);
    expect(unknownGet(eventSource, 'internalRetryMax')).toBeUndefined();
    expect(unknownGet(eventSource, 'eventTimeout')).toBeUndefined();
  });

  it('does not enable event timeouts without a server promise', () => {
    const eventSource = new FetchEventSource('http://example.com');
    const receivedHeaders = unknownGet<(response: Response) => void>(
      eventSource,
      'receivedHeaders',
    ).bind(eventSource);

    receivedHeaders(new Response());

    expect(unknownGet(eventSource, 'eventTimeoutCheckHandle')).toBeUndefined();

    eventSource.close();
  });

  it('fails non-successful responses without reconnecting', async () => {
    fetchMock.get('http://example.com', { status: 400 });

    const eventSource = new FetchEventSource('http://example.com');

    await waitForEvent((resolve, reject) => {
      eventSource.onerror = (event) => {
        try {
          expect(unknownGet(event, 'error')).toBeInstanceOf(Problem);
          expect(eventSource.readyState).toBe(eventSource.CLOSED);
          expect(
            unknownGet(eventSource, 'reconnectTimeoutHandle'),
          ).toBeUndefined();
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      };
      eventSource.connect();
    });
  });

  it('stops reconnecting after a 204 response', async () => {
    fetchMock.get('http://example.com', { status: 204 });

    const eventSource = new FetchEventSource('http://example.com');

    await waitForEvent((resolve, reject) => {
      eventSource.onerror = () => {
        try {
          expect(eventSource.readyState).toBe(eventSource.CLOSED);
          expect(
            unknownGet(eventSource, 'reconnectTimeoutHandle'),
          ).toBeUndefined();
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      };
      eventSource.connect();
    });
  });

  it('reconnects with last-event-id', async () => {
    const eventStream = new TextEncoder().encode(
      'retry: 10\nevent: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, reject) => {
      fetchMock.get('http://example.com', (callLog) => {
        try {
          expect(callLog.options.headers ?? {}).toEqual(
            expect.objectContaining({ 'last-event-id': '12345' }),
          );
          resolve();
        } catch (error) {
          reject(error as Error);
        }

        return { status: 204 };
      });
      eventSource.connect();
    });
    eventSource.close();
  });

  it('reconnects with last-event-id ignoring invalid ids', async () => {
    const eventStream = new TextEncoder().encode(
      'retry: 10\nevent: hello\nid: 12345\ndata: Hello World!\n\n' +
        'event: hello\nid: a\0c\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, reject) => {
      fetchMock.get('http://example.com', (callLog) => {
        try {
          expect(callLog.options.headers ?? {}).toEqual(
            expect.objectContaining({ 'last-event-id': '12345' }),
          );
          resolve();
        } catch (error) {
          reject(error as Error);
        }

        return { status: 204 };
      });
      eventSource.connect();
    });
    eventSource.close();
  });

  it('dispatches events', async () => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get(
      'http://example.com',
      { status: 503 },
    );

    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, reject) => {
      eventSource.addEventListener('hello', () => {
        eventSource.close();
        resolve();
      });
      eventSource.onerror = (event) => {
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
    });
  });

  it('stops reconnecting after explicit cancellation', async () => {
    const abortController = new AbortController();

    fetchMock.get('http://example.com', () =>
      delayedResponse({ status: 200 }, 5000),
    );

    const eventSource = new FetchEventSource('http://example.com', {
      signal: abortController.signal,
    });

    await waitForEvent((resolve, reject) => {
      let errorReceived = false;
      eventSource.onerror = () => {
        errorReceived = true;
      };
      eventSource.connect();

      setTimeout(() => {
        abortController.abort();
      }, 10);
      setTimeout(() => {
        try {
          expect(errorReceived).toBeFalse();
          expect(eventSource.readyState).toBe(eventSource.CLOSED);
          expect(
            unknownGet(eventSource, 'reconnectTimeoutHandle'),
          ).toBeUndefined();
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      }, 50);
    });
  });

  it('logs connection reader cancellation failures', async () => {
    const cancelError = new Error('Failed to cancel stream');
    const warnings: unknown[][] = [];

    await waitForEvent((resolve, _reject) => {
      const eventSource = new FetchEventSource('http://example.com', {
        logger: {
          warn: (...data: unknown[]) => {
            warnings.push(data);
            resolve();
          },
        },
      });
      const connectionReader = {
        cancel: () => Promise.reject(cancelError),
        releaseLock: () => {},
      } as unknown as ReadableStreamDefaultReader<Uint8Array>;

      unknownSet(eventSource, 'connectionReader', connectionReader);
      eventSource.readyState = eventSource.OPEN;
      eventSource.close();
    });

    expect(warnings).toEqual([
      ['failed to cancel connection reader', { error: cancelError }],
    ]);
  });

  it('counts comment only pings as events but does not dispatch', async () => {
    const eventStream = new TextEncoder().encode(
      ': ping\n\n: ping\n\nevent: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get(
      'http://example.com',
      { status: 503 },
    );

    const eventSource = new FetchEventSource('http://example.com');

    const lastEventReceivedTimeSet = spyOn(
      eventSource,
      'updateLastEventReceived' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const dispatchEventSpy = spyOn(eventSource, 'dispatchEvent');

    await waitForEvent((resolve, reject) => {
      eventSource.onmessage = (ev) => {
        expect(ev.type).toEqual('hello');
        expect(ev.data).toEqual('Hello World!');

        if (ev.type === 'hello') {
          expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
          expect(lastEventReceivedTimeSet).toHaveBeenCalledTimes(3);
          resolve();
        }
      };
      eventSource.onerror = (event) => {
        reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
    });
  });

  it('survives disconnections & close/connect cycles', async () => {
    const url = 'http://example.com/stream';
    const firstEvent = new TextEncoder().encode(
      'event: hello\nid: 1\ndata: First\n\n',
    ).buffer;
    const secondEvent = new TextEncoder().encode(
      'event: hello\nid: 2\ndata: Second\n\n',
    ).buffer;

    fetchMock.getOnce(
      url,
      () =>
        new Response(new Blob([firstEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.getOnce(
      url,
      () =>
        new Response(new Blob([secondEvent]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );

    const eventSource = new FetchEventSource(url);
    let messagesReceived = 0;

    await waitForEvent((resolve, reject) => {
      eventSource.onmessage = (ev) => {
        messagesReceived += 1;

        if (messagesReceived === 1) {
          eventSource.close();
          setTimeout(() => eventSource.connect(), 10);
          return;
        }

        if (messagesReceived === 2) {
          expect(ev.data).toBe('Second');
          eventSource.close();
          resolve();
        }
      };
      eventSource.onerror = (event) => {
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(event)}`));
      };
      eventSource.connect();
    });
  });
});
