import fetchMock from 'fetch-mock';
import { FetchEventSource, MediaType } from '../src';

describe('FetchEventSource', () => {
  beforeAll(() => {
    fetchMock.reset();
  });

  it('dispatches events', (done) => {
    const eventStream = new TextEncoder().encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n'
    ).buffer;

    fetchMock.getOnce(
      'http://example.com',
      new Response(new Blob([eventStream]), {
        headers: { 'content-type': MediaType.EVENT_STREAM },
      })
    );

    const eventSource = new FetchEventSource('http://example.com');
    eventSource.onmessage = (ev) => {
      console.log({ message: 'received', event: ev });
    };
    eventSource.onerror = (err) =>
      console.log({ message: 'error received', err });
    eventSource.addEventListener('hello', () => done());
    eventSource.connect();
  });

  xit('survives disconnections & close/connect cycles', (done) => {
    let messagesReceived = 0;
    const eventSource = new FetchEventSource('http://localhost:5555/stream', {
      logger: console,
    });
    eventSource.onopen = function () {
      console.log({ on: 'open', source: this });
    };
    eventSource.onmessage = function (ev) {
      console.log({ on: 'message', event: ev, source: this });
      if (messagesReceived++ >= 50) {
        done();
      }
    };
    eventSource.onerror = function (err) {
      console.log({ on: 'error', err, source: this });
    };
    eventSource.connect();

    setTimeout(() => {
      eventSource.close();
      eventSource.connect();
    }, 5000);
  }, 600000);
});
