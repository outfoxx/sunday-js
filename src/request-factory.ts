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

import { ConstructableClassType } from './class-type.js';
import { MediaType } from './media-type.js';
import { TextMediaTypeDecoder } from './media-type-codecs/media-type-decoder.js';
import { Problem } from './problem.js';
import { ResultResponse } from './result-response.js';
import { URLTemplate } from './url-template.js';
import { Logger } from './logger.js';
import { Serde } from './serde.js';

export interface RequestFactory {
  readonly baseUrl: URLTemplate;

  registerProblem(
    type: URL | string,
    problemType: ConstructableClassType<Problem>,
  ): void;

  request(
    requestSpec: RequestSpec<unknown>,
  ): Promise<Request>;

  response(
    request: Request,
    dataExpected?: boolean,
  ): Promise<Response>;

  response<B>(
    requestSpec: RequestSpec<B>,
    dataExpected?: boolean,
  ): Promise<Response>;

  resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: Serde<R>,
  ): Promise<ResultResponse<R>>;

  resultResponse<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<ResultResponse<void>>;

  result<B, R>(requestSpec: RequestSpec<B>, resultType: Serde<R>): Promise<R>;

  result<B>(requestSpec: RequestSpec<B>): Promise<void>;

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
  ): AsyncIterable<E>;
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
  bodyType?: Serde<B>;
  contentTypes?: MediaType[];
  acceptTypes?: MediaType[];
  headers?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RequestAdapter {
  adapt(requestFactory: RequestFactory, request: Request): Promise<Request>;
}
