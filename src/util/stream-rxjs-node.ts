import { Observable } from 'rxjs';
import { share } from 'rxjs/operators';
import { Duplex, Readable } from 'stream';

export function fromNative(bufferOrStream: unknown): Observable<ArrayBuffer> {
  if (bufferOrStream instanceof Readable) {
    return fromStream(bufferOrStream);
  }

  const stream = new Duplex();
  stream.push(bufferOrStream);
  stream.push(null);
  return fromStream(stream);
}

export function fromStream(
  stream: Readable,
  finishEventName = 'end',
  dataEventName = 'data'
): Observable<ArrayBuffer> {
  stream.pause();

  return new Observable<ArrayBuffer>((subscriber) => {
    function dataHandler(data: Buffer) {
      subscriber.next(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      );
    }

    function errorHandler(err: unknown) {
      subscriber.error(err);
    }

    function endHandler() {
      subscriber.complete();
    }

    stream.addListener(dataEventName, dataHandler);
    stream.addListener('error', errorHandler);
    stream.addListener(finishEventName, endHandler);

    stream.resume();

    return () => {
      stream.removeListener(dataEventName, dataHandler);
      stream.removeListener('error', errorHandler);
      stream.removeListener(finishEventName, endHandler);
    };
  }).pipe(share());
}
