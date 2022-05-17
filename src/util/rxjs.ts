import { catchError, from, Observable, throwError } from 'rxjs';
import { ClassType } from '../class-type';
import { Problem } from '../problem';

export function nullifyNotFound<T>(): (
  source: Observable<T>
) => Observable<T | null> {
  return nullifyResponse([404], []);
}

export function nullifyResponse<T>(
  statuses: number[],
  problemTypes: ClassType<Problem>[]
): (source: Observable<T>) => Observable<T | null> {
  return function <T>(source: Observable<T>): Observable<T | null> {
    return source.pipe(
      catchError((error) => {
        const errorType = error.constructor as ClassType<Problem>;
        if (
          error instanceof Problem &&
          (statuses.includes(error.status) || problemTypes.includes(errorType))
        ) {
          return from([null]);
        }
        return throwError(error);
      })
    );
  };
}
