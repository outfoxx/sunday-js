import { Observable } from 'rxjs';
import { share } from 'rxjs/operators';

export function fromNodeStream(stream: any): Observable<ArrayBuffer> {
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

    stream.addListener('data', dataHandler);
    stream.addListener('error', errorHandler);
    stream.addListener('end', endHandler);

    stream.resume();

    return () => {
      stream.removeListener('data', dataHandler);
      stream.removeListener('error', errorHandler);
      stream.removeListener('end', endHandler);
      stream.destroy();
    };
  }).pipe(share());
}
