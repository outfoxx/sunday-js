import { Observable } from 'rxjs';
import { AnyType } from './any-type';
import { ClassType } from './class-type';
import { MediaType } from './media-type';
import { URLTemplate } from './url-template';

export interface RequestFactory {
  readonly baseUrl: URLTemplate;

  request(requestSpec: RequestSpec<unknown>): Observable<Request>;

  response(request: Request, dataExpected?: boolean): Observable<Response>;

  response<B>(
    requestSpec: RequestSpec<B>,
    dataExpected?: boolean
  ): Observable<Response>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<R>]
  ): Observable<R>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Array<unknown>>, ClassType<R>]
  ): Observable<Array<R>>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Set<unknown>>, ClassType<R>]
  ): Observable<Set<R>>;

  result<B, R>(requestSpec: RequestSpec<B>, resultType: AnyType): Observable<R>;

  result<B>(requestSpec: RequestSpec<B>): Observable<void>;

  events(requestSpec: RequestSpec<void>): ExtEventSource;

  events<E>(
    requestSpec: RequestSpec<void>,
    eventTypes: EventTypes<E>
  ): Observable<E>;
}

export interface ExtEventSource extends EventSource {
  connect(): void;
}

export type RequestMethod =
  | 'GET'
  | 'PUT'
  | 'POST'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export interface RequestSpec<B> {
  method: RequestMethod;
  pathTemplate: string;
  pathParameters?: Record<string, unknown>;
  queryParameters?: Record<string, unknown>;
  body?: B;
  bodyType?: AnyType;
  contentTypes?: (MediaType | string)[];
  acceptTypes?: (MediaType | string)[];
  headers?: HeadersInit;
}

export interface EventTypes<E> {
  [key: string]: AnyType;
}

export type RequestAdapter = (request: Request) => Observable<Request>;
