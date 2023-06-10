// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Observable } from 'rxjs';
import { AnyType } from './any-type';
import { ClassType, ConstructableClassType } from './class-type';
import { MediaType } from './media-type';
import { TextMediaTypeDecoder } from './media-type-codecs/media-type-decoder';
import { Problem } from './problem';
import { ResultResponse } from './result-response';
import { URLTemplate } from './url-template';
import { Logger } from './logger';

export interface RequestFactory {
  readonly baseUrl: URLTemplate;

  registerProblem(
    type: URL | string,
    problemType: ConstructableClassType<Problem>,
  ): void;

  request(requestSpec: RequestSpec<unknown>): Observable<Request>;

  response(request: Request, dataExpected?: boolean): Observable<Response>;

  response<B>(
    requestSpec: RequestSpec<B>,
    dataExpected?: boolean,
  ): Observable<Response>;

  resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<R>],
  ): Observable<ResultResponse<R>>;

  resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Array<unknown>>, ClassType<R>],
  ): Observable<ResultResponse<Array<R>>>;

  resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Set<unknown>>, ClassType<R>],
  ): Observable<ResultResponse<Set<R>>>;

  resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: AnyType,
  ): Observable<ResultResponse<R>>;

  resultResponse<B>(
    requestSpec: RequestSpec<B>,
  ): Observable<ResultResponse<void>>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<R>],
  ): Observable<R>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Array<unknown>>, ClassType<R>],
  ): Observable<Array<R>>;

  result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: [ClassType<Set<unknown>>, ClassType<R>],
  ): Observable<Set<R>>;

  result<B, R>(requestSpec: RequestSpec<B>, resultType: AnyType): Observable<R>;

  result<B>(requestSpec: RequestSpec<B>): Observable<void>;

  eventSource(requestSpec: RequestSpec<void>): ExtEventSource;

  eventStream<E>(
    requestSpec: RequestSpec<void>,
    decoder: (
      decoder: TextMediaTypeDecoder,
      event: string | undefined,
      id: string | undefined,
      data: string,
      logger?: Logger,
    ) => E | undefined,
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
  contentTypes?: MediaType[];
  acceptTypes?: MediaType[];
  headers?: Record<string, unknown>;
}

export interface RequestAdapter {
  adapt(requestFactory: RequestFactory, request: Request): Promise<Request>;
}
