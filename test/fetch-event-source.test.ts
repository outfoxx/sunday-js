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
import { unknownGet, unknownSet } from '../src/util/any';
import { FetchEventSource, MediaType, Problem } from '../src';
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

  it('reconnects with last-event-id', async () => {
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
    fetchMock.get('http://example.com', (callLog) => {
      expect(callLog.options.headers ?? {}).toEqual(
        expect.objectContaining({ 'last-event-id': '12345' }),
      );

      return {
        status: 503,
      };
    });

    let connectErrors = 0;

    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, _reject) => {
      eventSource.onerror = (ev) => {
        const error = unknownGet(ev, 'error');
        if (error instanceof Problem && error.status == 503) {
          connectErrors += 1;
        }
        if (connectErrors >= 2) {
          eventSource.close();
          resolve();
        }
      };
      eventSource.onmessage = () => {
        // Ignore the initial message; reconnect behavior is asserted via errors.
      };
      eventSource.connect();
    });
  });

  it('reconnects with last-event-id ignoring invalid ids', async () => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n' +
        'event: hello\nid: a\0c\ndata: Hello World!\n\n',
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        }),
    );
    fetchMock.get('http://example.com', (callLog) => {
      expect(callLog.options.headers ?? {}).toEqual(
        expect.objectContaining({ 'last-event-id': '12345' }),
      );

      return {
        status: 503,
      };
    });

    let connectErrors = 0;

    const eventSource = new FetchEventSource('http://example.com');
    await waitForEvent((resolve, _reject) => {
      eventSource.onerror = (ev) => {
        const error = unknownGet(ev, 'error');
        if (error instanceof Problem && error.status == 503) {
          connectErrors += 1;
        }
        if (connectErrors >= 2) {
          eventSource.close();
          resolve();
        }
      };
      eventSource.onmessage = () => {
        // Ignore the initial message; reconnect behavior is asserted via errors.
      };
      eventSource.connect();
    });
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

  it('handles close aborts gracefully', async () => {
    const abortController = new AbortController();

    fetchMock.get('http://example.com', () =>
      delayedResponse({ status: 200 }, 5000),
    );

    const eventSource = new FetchEventSource('http://example.com');
    unknownSet(eventSource, 'signal', abortController.signal);

    await waitForEvent((resolve, reject) => {
      eventSource.onerror = (ev) => {
        const error = unknownGet(ev, 'error');
        if (error instanceof DOMException && error.name === 'AbortError') {
          eventSource.close();
          resolve();
          return;
        }
        eventSource.close();
        reject(new Error(`Unexpected event source error: ${String(error)}`));
      };
      eventSource.connect();

      setTimeout(() => {
        abortController.abort();
      }, 250);
    });
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
          expect(lastEventReceivedTimeSet).toHaveBeenCalledTimes(4);
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
