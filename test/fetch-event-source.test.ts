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
});
