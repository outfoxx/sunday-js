import { defer, map, Observable, of, switchMap } from 'rxjs';
import { AnyType } from './any-type';
import { ConstructableClassType } from './class-type';
import { validate } from './fetch';
import { FetchEventSource } from './fetch-event-source';
import { HeaderParameters } from './header-parameters';
import { Logger } from './logger';
import { MediaType } from './media-type';
import { TextMediaTypeDecoder } from './media-type-codecs/media-type-decoder';
import { MediaTypeDecoders } from './media-type-codecs/media-type-decoders';
import { isURLQueryParamsEncoder } from './media-type-codecs/media-type-encoder';
import { MediaTypeEncoders } from './media-type-codecs/media-type-encoders';
import { Problem } from './problem';
import {
  ExtEventSource,
  RequestAdapter,
  RequestFactory,
  RequestSpec,
} from './request-factory';
import { SundayError } from './sunday-error';
import { URLTemplate } from './url-template';
import { errorToMessage } from './util/error';

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
    }
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
    problemType: ConstructableClassType<Problem>
  ): void {
    const typeStr = type instanceof URL ? type.toString() : type;
    this.problemTypes.set(typeStr, problemType);
  }

  request(
    requestSpec: RequestSpec<unknown>,
    requestInit?: RequestInit
  ): Observable<Request> {
    //
    return defer(() => {
      const url = this.baseUrl.complete(
        requestSpec.pathTemplate,
        requestSpec.pathParameters ?? {}
      );

      if (requestSpec.queryParameters) {
        const encoder = this.mediaTypeEncoders.find(
          MediaType.WWWFormUrlEncoded
        );
        if (!isURLQueryParamsEncoder(encoder)) {
          throw Error(
            `MediaTypeEncoder for ${MediaType.WWWFormUrlEncoded} must be an instance of URLQueryParamsEncoder`
          );
        }
        url.search = `?${encoder.encodeQueryString(
          requestSpec.queryParameters
        )}`;
      }

      const headers = new Headers(HeaderParameters.encode(requestSpec.headers));

      // Determine & add accept header
      if (requestSpec.acceptTypes) {
        const supportedAcceptTypes = requestSpec.acceptTypes.filter((type) =>
          this.mediaTypeDecoders.supports(type)
        );

        if (!supportedAcceptTypes.length) {
          throw Error(
            'None of the provided accept types has a reqistered decoder'
          );
        }

        const accept = supportedAcceptTypes.join(' , ');

        headers.set('accept', accept);
      }

      // Determine content type
      const contentType = requestSpec.contentTypes?.find((type) =>
        this.mediaTypeEncoders.supports(type)
      );

      // If matched, add content type (even if body is nil, to match any expected server requirements)
      if (contentType) {
        headers.set('content-type', contentType.toString());
      }

      // Encode & add body data
      let body: BodyInit | undefined;
      if (requestSpec.body) {
        if (!contentType) {
          throw Error(
            'None of the provided content types has a registered encoder'
          );
        }

        body = this.mediaTypeEncoders
          .find(contentType)
          .encode(requestSpec.body, requestSpec.bodyType);
      }

      const init: RequestInit = Object.assign({}, requestInit, {
        headers,
        body,
        method: requestSpec.method,
      });

      const request = new Request(url.toString(), init);

      return this.adapter?.(request) ?? of(request);
    });
  }

  response(
    request: Request | RequestSpec<unknown>,
    dataExpected?: boolean
  ): Observable<Response> {
    const request$ =
      request instanceof Request ? of(request) : this.request(request);
    return request$.pipe(
      switchMap((req) => fetch(req)),
      switchMap((response) =>
        validate(response, dataExpected ?? false, this.problemTypes)
      )
    );
  }

  result<B, R>(requestSpec: RequestSpec<B>, resultType: AnyType): Observable<R>;
  result<B>(requestSpec: RequestSpec<B>): Observable<void>;
  result(
    request: RequestSpec<unknown>,
    responseType?: AnyType
  ): Observable<unknown> {
    const response$ = this.response(request, !!responseType);

    if (!responseType) {
      return response$.pipe(map(() => undefined));
    } else {
      return response$.pipe(
        switchMap(async (response) => {
          try {
            const contentType = MediaType.from(
              response.headers.get('content-type'),
              MediaType.OctetStream
            );
            const decoder = this.mediaTypeDecoders.find(contentType);
            return await decoder.decode(response, responseType);
          } catch (error) {
            throw await SundayError.fromResponse(
              errorToMessage(error, 'Response Decoding Failed'),
              response
            );
          }
        })
      );
    }
  }

  eventSource(requestSpec: RequestSpec<void>): ExtEventSource {
    //
    const adapter = (
      url: string,
      requestInit: RequestInit
    ): Observable<Request> => {
      const eventSourceSpec = Object.assign({}, requestSpec, {
        pathTemplate: url,
      });
      return this.request(eventSourceSpec, requestInit);
    };

    return new FetchEventSource(requestSpec.pathTemplate, {
      logger: this.logger,
      adapter,
    });
  }

  eventStream<E>(
    requestSpec: RequestSpec<void>,
    decoder: (
      decoder: TextMediaTypeDecoder,
      event: string | undefined,
      id: string | undefined,
      data: string,
      logger?: Logger
    ) => E | undefined
  ): Observable<E> {
    const eventSource = this.eventSource(requestSpec);

    const jsonDecoder = this.mediaTypeDecoders.find(
      MediaType.JSON
    ) as TextMediaTypeDecoder;

    return new Observable((subscriber) => {
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
            this.logger
          );
          if (!decodedEvent) {
            return;
          }

          subscriber.next(decodedEvent);
        } catch (error) {
          subscriber.error(error);
        }
      };

      eventSource.onerror = (event) => {
        this.logger?.error?.({ event }, 'event source error');
      };

      eventSource.connect();

      return () => {
        eventSource.close();
      };
    });
  }
}
