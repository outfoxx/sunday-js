import fetchMock from 'fetch-mock';
import { unknownGet } from 'util/any';
import { FetchEventSource, MediaType, Problem } from '../src';
import { delayedResponse } from './fetch-mock-utils';
import objectContaining = jasmine.objectContaining;

describe('FetchEventSource', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('ignores double connect', (done) => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.get(
      'http://example.com',
      {
        status: 503,
      },
      { overwriteRoutes: false }
    );

    const eventSource = new FetchEventSource('http://example.com');
    eventSource.onmessage = done;
    eventSource.connect();
    eventSource.connect();
  });

  it('updates retry time', (done) => {
    const eventStream = new TextEncoder().encode(
      'retry: 12345\nevent: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.get(
      'http://example.com',
      {
        status: 503,
      },
      { overwriteRoutes: false }
    );

    const eventSource = new FetchEventSource('http://example.com');

    eventSource.onmessage = () => {
      eventSource.close();
      expect(eventSource.retryTime).toBe(12345);
      done();
    };
    eventSource.connect();
  });

  it('reconnects with last-event-id', (done) => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.get(
      'http://example.com',
      (_, req) => {
        expect(req.headers).toEqual(
          objectContaining({ 'last-event-id': '12345' })
        );

        return {
          status: 503,
        };
      },
      { overwriteRoutes: false }
    );

    let connectErrors = 0;

    const eventSource = new FetchEventSource('http://example.com');
    eventSource.onerror = (ev) => {
      const error = unknownGet(ev, 'error');
      if (error instanceof Problem && error.status == 503) {
        connectErrors += 1;
      }
      if (connectErrors >= 2) {
        eventSource.close();
        done();
      }
    };
    eventSource.connect();
  });

  it('reconnects with last-event-id ignoring invalid ids', (done) => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n' +
        'event: hello\nid: a\0c\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.get(
      'http://example.com',
      (_, req) => {
        expect(req.headers).toEqual(
          objectContaining({ 'last-event-id': '12345' })
        );

        return {
          status: 503,
        };
      },
      { overwriteRoutes: false }
    );

    let connectErrors = 0;

    const eventSource = new FetchEventSource('http://example.com');
    eventSource.onerror = (ev) => {
      const error = unknownGet(ev, 'error');
      if (error instanceof Problem && error.status == 503) {
        connectErrors += 1;
      }
      if (connectErrors >= 2) {
        eventSource.close();
        done();
      }
    };
    eventSource.connect();
  });

  it('dispatches events', (done) => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      () =>
        new Response(new Blob([eventStream]), {
          headers: { 'content-type': MediaType.EventStream.toString() },
        })
    );
    fetchMock.get(
      'http://example.com',
      { status: 503 },
      { overwriteRoutes: false }
    );

    const eventSource = new FetchEventSource('http://example.com');
    eventSource.addEventListener('hello', () => {
      eventSource.close();
      done();
    });
    eventSource.connect();
  });

  it('handles close aborts gracefully', (done) => {
    const abortController = new AbortController();

    fetchMock.get('http://example.com', () =>
      delayedResponse({ status: 200 }, 500)
    );

    const eventSource = new FetchEventSource('http://example.com', {
      abortController,
    });

    eventSource.onerror = (ev) => {
      const error = unknownGet(ev, 'error');
      if (error instanceof DOMException && error.name === 'AbortError') {
        eventSource.close();
        done();
      }
    };
    eventSource.connect();

    setTimeout(() => {
      abortController.abort();
    }, 250);
  });

  xit('survives disconnections & close/connect cycles', (done) => {
    let messagesReceived = 0;
    const eventSource = new FetchEventSource('http://localhost:5555/stream', {
      logger: console,
    });
    eventSource.onopen = () => {
      console.log({ on: 'open (survival)', source: this });
    };
    eventSource.onmessage = (ev) => {
      console.log({ on: 'message (survival)s', event: ev, source: this });
      if (messagesReceived++ >= 50) {
        done();
      }
    };
    eventSource.onerror = (err) => {
      console.error({ on: 'error (survival)', err, source: this });
    };
    eventSource.connect();

    setTimeout(() => {
      eventSource.close();
      eventSource.connect();
    }, 5000);
  }, 600000);
});
