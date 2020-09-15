import { from, Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Problem } from '../problem';

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

export function nullifyNotFound<T>(): (source: Observable<T>) => Observable<T | null> {
  return function<T>(source: Observable<T>): Observable<T | null> {
    return source.pipe(
      catchError(error => {
        if (!(error instanceof Problem) || error.status !== 404) {
          return throwError(error);
        }
        return from([null]);
      })
    );
  }
}
