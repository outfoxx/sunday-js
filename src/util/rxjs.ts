import { from, Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Problem } from '../problem';

export function nullifyNotFound<T>(): (
  source: Observable<T>
) => Observable<T | null> {
  return function <T>(source: Observable<T>): Observable<T | null> {
    return source.pipe(
      catchError((error) => {
        if (!(error instanceof Problem) || error.status !== 404) {
          return throwError(error);
        }
        return from([null]);
      })
    );
  };
}
