import { Observable } from 'rxjs';

export function fromStream(
  stream: ReadableStream<Uint8Array>
): Observable<ArrayBuffer> {
  return new Observable((subscriber) => {
    let reader: ReadableStreamDefaultReader | undefined;
    (async function readLoop() {
      try {
        reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (value !== undefined) {
            subscriber.next(value);
          }

          if (done) {
            subscriber.complete();
            return;
          }
        }
      } catch (e) {
        subscriber.error(e);
      }
    })();
    return () => reader?.cancel();
  });
}
