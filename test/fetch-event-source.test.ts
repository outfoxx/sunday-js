import { Readable } from 'stream';
import { FetchEventSource, MediaType } from '../src';

describe('FetchEventSource', () => {
  beforeAll(() => {
    jest.resetAllMocks();
    fetchMock.resetMocks();
  });

  it('dispatches events', (done) => {
    const eventStream = Readable.from(
      Buffer.from('event: hello\nid: 12345\ndata: Hello World!\n\n')
    );

    fetchMock.mockResponse((eventStream as unknown) as string, {
      headers: { 'content-type': MediaType.EVENT_STREAM },
    });

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
