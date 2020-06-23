import { Observable } from 'rxjs';

export function fromStreamReader(
  stream: ReadableStream<Uint8Array>
): Observable<ArrayBuffer> {
  return new Observable((subscriber) => {
    (async function readLoop() {
      try {
        while (true) {
          const { done, value } = await stream.getReader().read();
          subscriber.next(value);

          if (done) {
            subscriber.complete();
            return;
          }
        }
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
}
