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

import { copyRequest } from './fetch-copy.js';
import { inheritBody } from './util/owned-body.js';
import { prepareRequestBody } from './request-body.js';
import { RequestValidationError } from './request-validation-error.js';
import { unknownGet } from './util/unknowns.js';
import { RequestExecution } from './request-execution.js';
import { ResponseAdapter } from './response-adapter.js';
import {
  isRequestStopped,
  requestFailure,
} from './request-cancellation-error.js';
import { ZodError } from 'zod';
import { SchemaLike } from './schema-runtime.js';
import { mergeHeaders, validate } from './fetch.js';
import { FetchEventSource } from './fetch-event-source.js';
import { HeaderParameters } from './header-parameters.js';
import { Logger } from './logger.js';
import { MediaType } from './media-type.js';
import { TextMediaTypeDecoder } from './media-type-codecs/media-type-decoder.js';
import { BinaryDecoder } from './media-type-codecs/binary-decoder.js';
import { MediaTypeDecoders } from './media-type-codecs/media-type-decoders.js';
import { isURLQueryParamsEncoder } from './media-type-codecs/media-type-encoder.js';
import { MediaTypeEncoders } from './media-type-codecs/media-type-encoders.js';
import { Problem } from './problem.js';
import {
  ExtEventSource,
  RequestAdapter,
  Transport,
  RequestSpec,
} from './transport.js';
import { OperationResponse } from './operation-response.js';
import { SundayError } from './sunday-error.js';
import { isStreamingBody } from './streaming-body.js';
import { URLTemplate } from './url-template.js';
import { errorToMessage } from './util/errors.js';

export class FetchTransport implements Transport {
  public baseUrl: URLTemplate;
  private readonly execution: RequestExecution;
  private readonly maxBufferedRequestBytes?: number;
  public mediaTypeEncoders: MediaTypeEncoders;
  public mediaTypeDecoders: MediaTypeDecoders;
  public problemTypes = new Map<string, SchemaLike<Problem>>();
  public logger?: Logger;

  constructor(
    baseUrl: string | URLTemplate,
    options?: {
      /** @deprecated Use requestAdapter. The adapt method now receives only the native request. */
      adapter?: RequestAdapter;
      requestAdapter?: RequestAdapter;
      responseAdapter?: ResponseAdapter;
      mediaTypeEncoders?: MediaTypeEncoders;
      mediaTypeDecoders?: MediaTypeDecoders;
      logger?: Logger;
      /** Upload fallback buffer limit in bytes; defaults to 16 MiB. */
      maxBufferedRequestBytes?: number;
    },
  ) {
    this.baseUrl =
      typeof baseUrl === 'string' ? new URLTemplate(baseUrl) : baseUrl;
    this.maxBufferedRequestBytes = options?.maxBufferedRequestBytes;
    this.execution = new RequestExecution(
      options?.requestAdapter ?? options?.adapter,
      options?.responseAdapter,
    );
    this.mediaTypeEncoders =
      options?.mediaTypeEncoders ?? MediaTypeEncoders.DEFAULT;
    this.mediaTypeDecoders =
      options?.mediaTypeDecoders ?? MediaTypeDecoders.DEFAULT;
    this.logger = options?.logger ?? console;
  }

  /** Uses a generated endpoint with only the adapters explicitly supplied by the caller. */
  static fromSettings(
    settings: { baseUrl: string },
    options?: ConstructorParameters<typeof FetchTransport>[1],
  ): FetchTransport {
    return new FetchTransport(settings.baseUrl, options);
  }

  registerProblem(type: URL | string, problemType: SchemaLike<Problem>): void {
    const typeStr = type instanceof URL ? type.toString() : type;
    this.problemTypes.set(typeStr, problemType);
  }

  /** Materializes an optionally authorized native request; execution belongs to its consumer. */
  async transportRequest(requestSpec: RequestSpec<unknown>): Promise<Request> {
    return this.execution.export(
      await this.prepareRequest(requestSpec),
      requestSpec.security ?? [],
    );
  }

  private async prepareRequest(
    requestSpec: RequestSpec<unknown>,
  ): Promise<Request> {
    requestSpec.signal?.throwIfAborted();
    try {
      requestSpec.parameterValidation?.();
    } catch (cause) {
      if (isRequestStopped(cause)) throw cause;
      throw new RequestValidationError(cause);
    }
    if (
      requestSpec.body !== undefined &&
      ['GET', 'HEAD'].includes(requestSpec.method.toUpperCase())
    )
      throw new TypeError('GET and HEAD requests cannot have a body');
    const url = this.baseUrl.complete(
      requestSpec.pathTemplate,
      requestSpec.pathParameters ?? {},
    );

    if (requestSpec.queryParameters) {
      const encoder = this.mediaTypeEncoders.find(MediaType.WWWFormUrlEncoded);
      if (!isURLQueryParamsEncoder(encoder)) {
        throw new Error(
          `MediaTypeEncoder for ${MediaType.WWWFormUrlEncoded} must be an instance of URLQueryParamsEncoder`,
        );
      }
      url.search = `?${encoder.encodeQueryString(requestSpec.queryParameters)}`;
    }

    const headers = new Headers(HeaderParameters.encode(requestSpec.headers));

    // Determine & add accept header
    if (requestSpec.acceptTypes) {
      const supportedAcceptTypes = requestSpec.acceptTypes.filter(
        (type) =>
          requestSpec.binaryResponse || this.mediaTypeDecoders.supports(type),
      );

      if (!supportedAcceptTypes.length) {
        throw new Error(
          'None of the provided accept types has a registered decoder',
        );
      }

      const accept = supportedAcceptTypes.join(' , ');

      headers.set('accept', accept);
    }

    // Determine content type
    const streamingBody = isStreamingBody(requestSpec.body)
      ? requestSpec.body
      : undefined;
    const contentType = requestSpec.contentTypes?.find(
      (type) =>
        streamingBody !== undefined || this.mediaTypeEncoders.supports(type),
    );

    // If matched, add the content type (even if the body is nil,
    // to match any expected server requirements)
    if (
      contentType &&
      (streamingBody === undefined || !headers.has('content-type'))
    ) {
      headers.set('content-type', contentType.toString());
    }

    // Encode & add body data
    let body: BodyInit | undefined;
    if (requestSpec.body !== undefined) {
      if (streamingBody !== undefined) {
        body = streamingBody.toBodyInit();
      } else {
        if (!contentType) {
          throw new Error(
            'None of the provided content types has a registered encoder',
          );
        }

        body = this.mediaTypeEncoders
          .find(contentType)
          .encode(requestSpec.body, requestSpec.bodyType, 'request');
      }
    }

    try {
      body = await prepareRequestBody(body, {
        signal: requestSpec.signal,
        maxBytes: this.maxBufferedRequestBytes,
      });

      const init: RequestInit & { duplex?: 'half' } = {
        headers,
        body,
        method: requestSpec.method,
        signal: requestSpec.signal,
        redirect: requestSpec.security?.length ? 'manual' : undefined,
      };
      if (body instanceof ReadableStream) {
        init.duplex = 'half';
      }

      const request = new Request(url.toString(), init);
      inheritBody(body instanceof ReadableStream ? body : undefined, request);
      return request;
    } catch (error) {
      if (body instanceof ReadableStream)
        void body.cancel(error).catch(() => undefined);
      throw error;
    }
  }

  async transportResponse(
    request: Request | RequestSpec<unknown>,
    dataExpected = false,
  ): Promise<Response> {
    return this.execute(request, (response) =>
      validate(response, dataExpected, this.problemTypes, this.logger),
    );
  }

  private async execute<T>(
    request: Request | RequestSpec<unknown>,
    consume: (response: Response, request: Request) => T | Promise<T>,
  ): Promise<T> {
    const prepared =
      request instanceof Request ? request : await this.prepareRequest(request);
    return this.execution.execute(
      prepared,
      request instanceof Request ? [] : (request.security ?? []),
      consume,
    );
  }

  async response<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: SchemaLike<R>,
  ): Promise<OperationResponse<R>>;
  async response<B>(
    requestSpec: RequestSpec<B>,
  ): Promise<OperationResponse<void>>;
  async response(
    request: RequestSpec<unknown>,
    responseType?: SchemaLike,
  ): Promise<OperationResponse<unknown>> {
    return this.execute(request, async (response, sent) => {
      await validate(response, !!responseType, this.problemTypes, this.logger);
      if (!responseType) return new OperationResponse(undefined, response);
      try {
        const contentType = MediaType.from(
          response.headers.get('content-type'),
          MediaType.OctetStream,
        );
        const decoder = request.binaryResponse
          ? BinaryDecoder.default
          : this.mediaTypeDecoders.find(contentType);
        return new OperationResponse(
          await decoder.decode(response, responseType),
          response,
        );
      } catch (error) {
        const failure = requestFailure(error, sent.signal);
        if (sent.signal.aborted || isRequestStopped(failure)) throw failure;
        throw await SundayError.fromResponse(
          errorToMessage(error, 'Response Decoding Failed'),
          response,
        );
      }
    });
  }

  async result<B, R>(
    requestSpec: RequestSpec<B>,
    resultType: SchemaLike<R>,
  ): Promise<R>;
  async result<B>(requestSpec: RequestSpec<B>): Promise<void>;
  async result(
    request: RequestSpec<unknown>,
    responseType?: SchemaLike,
  ): Promise<unknown> {
    return (
      responseType
        ? await this.response(request, responseType)
        : await this.response(request)
    ).result;
  }

  eventSource(requestSpec: RequestSpec<void>): ExtEventSource {
    return new FetchEventSource(requestSpec.pathTemplate, {
      logger: this.logger,
      adapter: async (url, init) => {
        const request = await this.prepareRequest({
          ...requestSpec,
          pathTemplate: url,
          signal: AbortSignal.any(
            [requestSpec.signal, init.signal].filter(
              (value): value is AbortSignal => !!value,
            ),
          ),
        });
        return copyRequest(request, {
          ...init,
          signal: request.signal,
          headers: mergeHeaders(request.headers, init.headers),
        });
      },
      fetch: (request, _signal, observeSignal) =>
        this.execution.execute(
          request,
          requestSpec.security ?? [],
          (response) => response,
          observeSignal,
        ),
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

    let connected = false;
    let closed = false;
    const pending: {
      resolve: (value: IteratorResult<E>) => void;
      reject: (reason?: unknown) => void;
    }[] = [];
    const queue: E[] = [];
    let error: unknown;
    let failed = false;

    const push = (value: E) => {
      if (closed) {
        return;
      }
      const next = pending.shift();
      if (next) {
        next.resolve({ value, done: false });
        return;
      }
      queue.push(value);
    };

    const terminate = (failure?: { reason: unknown }) => {
      if (closed) return;
      closed = true;
      failed = failure !== undefined;
      error = failure?.reason;
      queue.length = 0;
      if (abortHandler)
        requestSpec.signal?.removeEventListener('abort', abortHandler);
      // Settle state before upstream cancellation, which can synchronously call application code.
      eventSource.close(error);
      for (const next of pending.splice(0)) {
        if (failed) next.reject(error);
        else next.resolve({ value: undefined as unknown as E, done: true });
      }
    };

    eventSource.onmessage = (event: MessageEvent<string>) => {
      if (closed || event.data == null) {
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
        if (decodedEvent === undefined) {
          return;
        }

        push(decodedEvent);
      } catch (err) {
        if (isRequestStopped(err) || !isEventDecodingError(err)) {
          terminate({ reason: err });
          return;
        }

        this.logger?.warn?.('skipping undecodable event stream event', {
          error: err,
          event: event.type,
          id: event.lastEventId,
        });
      }
    };

    eventSource.onerror = (event) => {
      this.logger?.error?.({ event }, 'event source error');
      const cause = unknownGet(event, 'error');
      if (eventSource.readyState === eventSource.CLOSED) {
        terminate({
          reason:
            'error' in event
              ? cause
              : new Error('Event source closed with an error'),
        });
      }
    };

    let abortHandler: (() => void) | undefined;
    if (requestSpec.signal?.aborted) {
      terminate({ reason: requestSpec.signal.reason });
    } else {
      abortHandler = () => {
        terminate({ reason: requestSpec.signal!.reason });
      };
      requestSpec.signal?.addEventListener('abort', abortHandler);
    }

    const ensureConnected = () => {
      if (connected || closed) {
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
            if (failed) {
              return Promise.reject(error);
            }
            if (queue.length > 0) {
              return Promise.resolve({
                value: queue.shift() as E,
                done: false,
              });
            }
            if (closed) {
              return Promise.resolve({
                value: undefined as unknown as E,
                done: true,
              });
            }
            return new Promise<IteratorResult<E>>((resolve, reject) => {
              pending.push({ resolve, reject });
            });
          },
          return: () => {
            terminate();
            return Promise.resolve({
              value: undefined as unknown as E,
              done: true,
            });
          },
          throw: (err) => {
            terminate({ reason: err });
            return Promise.reject(err);
          },
        };
      },
    };
  }
}

function isEventDecodingError(error: unknown): error is SyntaxError | ZodError {
  return error instanceof SyntaxError || error instanceof ZodError;
}
