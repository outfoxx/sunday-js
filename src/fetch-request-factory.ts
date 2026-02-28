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

import { Serde } from './serde.js';
import { ConstructableClassType } from './class-type.js';
import { validate } from './fetch.js';
import { FetchEventSource } from './fetch-event-source.js';
import { HeaderParameters } from './header-parameters.js';
import { Logger } from './logger.js';
import { MediaType } from './media-type.js';
import { TextMediaTypeDecoder } from './media-type-codecs/media-type-decoder.js';
import { MediaTypeDecoders } from './media-type-codecs/media-type-decoders.js';
import { isURLQueryParamsEncoder } from './media-type-codecs/media-type-encoder.js';
import { MediaTypeEncoders } from './media-type-codecs/media-type-encoders.js';
import { Problem } from './problem.js';
import {
  ExtEventSource,
  RequestAdapter,
  RequestFactory,
  RequestSpec,
} from './request-factory.js';
import { ResultResponse } from './result-response.js';
import { SundayError } from './sunday-error.js';
import { URLTemplate } from './url-template.js';
import { errorToMessage } from './util/error.js';

export class FetchRequestFactory implements RequestFactory {
  public baseUrl: URLTemplate;
  public adapter?: RequestAdapter;
  public mediaTypeEncoders: MediaTypeEncoders;
  public mediaTypeDecoders: MediaTypeDecoders;
  public problemTypes = new Map<string, ConstructableClassType<Problem>>();
  public logger?: Logger;

  constructor(
    baseUrl: string | URLTemplate,
    options?: {
      adapter?: RequestAdapter;
      mediaTypeEncoders?: MediaTypeEncoders;
      mediaTypeDecoders?: MediaTypeDecoders;
      logger?: Logger;
    },
  ) {
    this.baseUrl =
      typeof baseUrl === 'string' ? new URLTemplate(baseUrl) : baseUrl;
    this.adapter = options?.adapter;
    this.mediaTypeEncoders =
      options?.mediaTypeEncoders ?? MediaTypeEncoders.DEFAULT;
    this.mediaTypeDecoders =
      options?.mediaTypeDecoders ?? MediaTypeDecoders.DEFAULT;
    this.logger = options?.logger ?? console;
  }

  registerProblem(
    type: URL | string,
    problemType: ConstructableClassType<Problem>,
  ): void {
    const typeStr = type instanceof URL ? type.toString() : type;
    this.problemTypes.set(typeStr, problemType);
  }

  async request(
    requestSpec: RequestSpec<unknown>,
  ): Promise<Request> {
    const url = this.baseUrl.complete(
      requestSpec.pathTemplate,
      requestSpec.pathParameters ?? {},
    );

    if (requestSpec.queryParameters) {
      const encoder = this.mediaTypeEncoders.find(
        MediaType.WWWFormUrlEncoded,
      );
      if (!isURLQueryParamsEncoder(encoder)) {
        throw Error(
          `MediaTypeEncoder for ${MediaType.WWWFormUrlEncoded} must be an instance of URLQueryParamsEncoder`,
        );
      }
      url.search = `?${encoder.encodeQueryString(
        requestSpec.queryParameters,
      )}`;
    }

    const headers = new Headers(HeaderParameters.encode(requestSpec.headers));

    // Determine & add accept header
    if (requestSpec.acceptTypes) {
      const supportedAcceptTypes = requestSpec.acceptTypes.filter((type) =>
                                                                    this.mediaTypeDecoders.supports(type),
      );

      if (!supportedAcceptTypes.length) {
        throw Error('None of the provided accept types has a registered decoder');
      }

      const accept = supportedAcceptTypes.join(' , ');

      headers.set('accept', accept);
    }

    // Determine content type
    const contentType = requestSpec.contentTypes?.find((type) =>
                                                         this.mediaTypeEncoders.supports(type),
    );

    // If matched, add the content type (even if the body is nil,
    // to match any expected server requirements)
    if (contentType) {
      headers.set('content-type', contentType.toString());
    }

    // Encode & add body data
    let body: BodyInit | undefined;
    if (requestSpec.body) {
      if (!contentType) {
        throw Error(
          'None of the provided content types has a registered encoder',
        );
      }

      body = this.mediaTypeEncoders
                 .find(contentType)
                 .encode(requestSpec.body, requestSpec.bodyType);
    }

    const init: RequestInit = {
      headers,
      body,
      method: requestSpec.method,
      signal: requestSpec.signal,
    };

    const request = new Request(url.toString(), init);
    return (await this.adapter?.adapt(this, request)) ?? request;
  }

  async response(
    request: Request | RequestSpec<unknown>,
    dataExpected?: boolean,
  ): Promise<Response> {
    const req =
      request instanceof Request
        ? request
        : await this.request(request);
    const response = await fetch(req);
    return await validate(response, dataExpected ?? false, this.problemTypes);
  }

  async resultResponse<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: Serde<R>,
  ): Promise<ResultResponse<R>>;
  async resultResponse<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<ResultResponse<void>>;
  async resultResponse(
    request: RequestSpec<unknown>,
    responseType?: Serde<unknown>,
  ): Promise<ResultResponse<unknown>> {
    const response = await this.response(request, !!responseType);
    if (!responseType) {
      return {
        result: undefined,
        response,
      };
    }

    try {
      const contentType = MediaType.from(
        response.headers.get('content-type'),
        MediaType.OctetStream,
      );
      const decoder = this.mediaTypeDecoders.find(contentType);
      const result = await decoder.decode(response, responseType);
      return {
        result,
        response,
      };
    }
    catch (error) {
      throw await SundayError.fromResponse(
        errorToMessage(error, 'Response Decoding Failed'),
        response,
      );
    }
  }

  async result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: Serde<R>,
  ): Promise<R>;
  async result<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<void>;
  async result(
    request: RequestSpec<unknown>,
    responseType?: Serde<unknown>,
  ): Promise<unknown> {
    const response = await this.response(request, !!responseType);

    if (!responseType) {
      return undefined;
    }

    try {
      const contentType = MediaType.from(
        response.headers.get('content-type'),
        MediaType.OctetStream,
      );
      const decoder = this.mediaTypeDecoders.find(contentType);
      return await decoder.decode(response, responseType);
    }
    catch (error) {
      throw await SundayError.fromResponse(
        errorToMessage(error, 'Response Decoding Failed'),
        response,
      );
    }
  }

  eventSource(requestSpec: RequestSpec<void>): ExtEventSource {
    //
    const adapter = (
      url: string,
      requestInit: RequestInit,
    ): Promise<Request> => {
      const eventSourceSpec = Object.assign({}, requestSpec, {
        pathTemplate: url,
      });
      return this.request(eventSourceSpec).then((baseRequest) => {
        const headers = new Headers(baseRequest.headers);
        const requestHeaders = new Headers(requestInit.headers);
        requestHeaders.forEach((value, key) => headers.set(key, value));

        return new Request(baseRequest, {
          ...requestInit,
          headers,
          signal: composeAbortSignals(
            eventSourceSpec.signal,
            requestInit.signal ?? undefined,
          ),
        });
      });
    };

    return new FetchEventSource(requestSpec.pathTemplate, {
      logger: this.logger,
      adapter,
      signal: requestSpec.signal,
    });
  }

  eventStream<E>(
    requestSpec: RequestSpec<void>,
    decoder: (
      decoder: TextMediaTypeDecoder,
      event: string | undefined,
      id: string | undefined,
      data: string,
      logger?: Logger,
    ) => E | undefined,
  ): AsyncIterable<E> {
    const eventSource = this.eventSource(requestSpec);

    // TODO: Determine event format from some well known extension headers.
    //  E.g., Quarkus sets `X-SSE-Content-Type` to the media type of the events.
    const jsonDecoder = this.mediaTypeDecoders.find(
      MediaType.JSON,
    ) as TextMediaTypeDecoder;

    const createAbortError = (): Error => {
      if (typeof DOMException !== 'undefined') {
        return new DOMException('The operation was aborted.', 'AbortError');
      }
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      return error;
    };

    let connected = false;
    let closed = false;
    let pending:
      | {
      resolve: (value: IteratorResult<E>) => void;
      reject: (reason?: unknown) => void;
    }
      | undefined;
    const queue: E[] = [];
    let error: unknown;

    const push = (value: E) => {
      if (closed || error) {
        return;
      }
      if (pending) {
        pending.resolve({ value, done: false });
        pending = undefined;
        return;
      }
      queue.push(value);
    };

    const fail = (cause: unknown) => {
      if (closed || error) {
        return;
      }
      error = cause;
      if (pending) {
        pending.reject(cause);
        pending = undefined;
      }
    };

    const finish = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (pending) {
        pending.resolve({ value: undefined as unknown as E, done: true });
        pending = undefined;
      }
    };

    eventSource.onmessage = (event: MessageEvent<string>) => {
      if (!event.data) {
        return;
      }

      try {
        const decodedEvent = decoder(
          jsonDecoder,
          event.type,
          event.lastEventId,
          event.data,
          this.logger,
        );
        if (!decodedEvent) {
          return;
        }

        push(decodedEvent);
      }
      catch (err) {
        fail(err);
      }
    };

    eventSource.onerror = (event) => {
      this.logger?.error?.({ event }, 'event source error');
    };

    let abortHandler: (() => void) | undefined;
    if (requestSpec.signal?.aborted) {
      fail(createAbortError());
      finish();
    }
    else {
      abortHandler = () => {
        fail(createAbortError());
        finish();
        eventSource.close();
      };
      requestSpec.signal?.addEventListener('abort', abortHandler);
    }

    const ensureConnected = () => {
      if (connected || closed || error) {
        return;
      }
      connected = true;
      eventSource.connect();
    };

    return {
      [Symbol.asyncIterator](): AsyncIterator<E> {
        ensureConnected();
        return {
          next: () => {
            if (error) {
              return Promise.reject(error);
            }
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift() as E, done: false });
            }
            if (closed) {
              return Promise.resolve({
                                       value: undefined as unknown as E,
                                       done: true,
                                     });
            }
            return new Promise<IteratorResult<E>>((resolve, reject) => {
              pending = { resolve, reject };
            });
          },
          return: () => {
            if (abortHandler) {
              requestSpec.signal?.removeEventListener('abort', abortHandler);
            }
            eventSource.close();
            finish();
            return Promise.resolve({
                                     value: undefined as unknown as E,
                                     done: true,
                                   });
          },
          throw: (err) => {
            if (abortHandler) {
              requestSpec.signal?.removeEventListener('abort', abortHandler);
            }
            eventSource.close();
            fail(err);
            finish();
            return Promise.reject(err);
          },
        };
      },
    };
  }
}

function composeAbortSignals(
  first?: AbortSignal,
  second?: AbortSignal,
): AbortSignal | undefined {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  if (first.aborted || second.aborted) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }

  const controller = new AbortController();
  const abort = () => {
    first.removeEventListener('abort', abort);
    second.removeEventListener('abort', abort);
    controller.abort();
  };
  first.addEventListener('abort', abort, { once: true });
  second.addEventListener('abort', abort, { once: true });

  return controller.signal;
}
