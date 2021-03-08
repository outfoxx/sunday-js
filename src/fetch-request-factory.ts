import { Observable, of, Subscriber } from 'rxjs';
import { mapTo, switchMap } from 'rxjs/operators';
import { AnyType } from './any-type';
import { ClassType } from './class-type';
import { validate } from './fetch';
import { FetchEventSource } from './fetch-event-source';
import { HttpError } from './http-error';
import { JSONDecoder } from './media-type-codecs/json-decoder';
import { Logger } from './logger';
import { MediaType } from './media-type';
import { MediaTypeDecoders } from './media-type-codecs/media-type-decoders';
import { isURLQueryParamsEncoder } from './media-type-codecs/media-type-encoder';
import { MediaTypeEncoders } from './media-type-codecs/media-type-encoders';
import { Problem, ProblemType } from './problem';
import {
  EventTypes,
  ExtEventSource,
  RequestAdapter,
  RequestFactory,
  RequestSpec,
} from './request-factory';
import { URLTemplate } from './url-template';

export class FetchRequestFactory implements RequestFactory {
  public baseUrl: URLTemplate;
  public adapter?: RequestAdapter;
  public mediaTypeEncoders: MediaTypeEncoders;
  public mediaTypeDecoders: MediaTypeDecoders;
  public problemTypes = new Map<string, ClassType<Problem>>();
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

  request(
    requestSpec: RequestSpec<unknown>,
    requestInit?: RequestInit
  ): Observable<Request> {
    //
    const url = this.baseUrl.complete(
      requestSpec.pathTemplate,
      requestSpec.pathParameters ?? {}
    );

    if (requestSpec.queryParameters) {
      const encoder = this.mediaTypeEncoders.find(MediaType.WWWFormUrlEncoded);
      if (!isURLQueryParamsEncoder(encoder)) {
        throw Error(
          `MediaTypeEncoder for ${MediaType.WWWFormUrlEncoded} must be an instance of URLEncoder`
        );
      }
      url.search = `?${encoder.encodeQueryString(requestSpec.queryParameters)}`;
    }

    const headers = new Headers(requestSpec.headers);

    // Determine & add accept header
    const supportedAcceptTypes = requestSpec.acceptTypes?.filter((type) =>
      this.mediaTypeDecoders.supports(type)
    );
    if (supportedAcceptTypes?.length) {
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
        throw Error('Unsupported content-type for request body');
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
  }

  response(
    request: Request | RequestSpec<unknown>,
    dataExpected?: boolean
  ): Observable<Response> {
    const request$ =
      request instanceof Request ? of(request) : this.request(request);
    return request$.pipe(
      switchMap((req) => fetch(req)),
      switchMap((response) => validate(response, dataExpected ?? false))
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
      return response$.pipe(mapTo(undefined));
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
            throw await HttpError.fromResponse(
              error.message ?? 'Unknown Error',
              response
            );
          }
        })
      );
    }
  }

  events(requestSpec: RequestSpec<void>): ExtEventSource;
  events<E>(
    requestSpec: RequestSpec<void>,
    eventTypes: EventTypes<E>
  ): Observable<E>;
  events(
    requestSpec: RequestSpec<void>,
    eventTypes?: EventTypes<unknown>
  ): ExtEventSource | Observable<unknown> {
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

    const eventSource = new FetchEventSource(requestSpec.pathTemplate, {
      logger: this.logger,
      adapter,
    });

    if (!eventTypes) {
      return eventSource;
    }

    const generateEventHandler = (
      eventType: AnyType,
      subscriber: Subscriber<unknown>
    ) => {
      return async (event: Event) => {
        const decoder = this.mediaTypeDecoders.find(
          MediaType.JSON
        ) as JSONDecoder;
        const msgEvent = event as MessageEvent;
        const deserializedEvent = await decoder.decodeText(
          msgEvent.data,
          eventType
        );
        subscriber.next(deserializedEvent);
      };
    };

    return new Observable((subscriber) => {
      for (const eventTypeName of Object.keys(eventTypes)) {
        const eventType = eventTypes[eventTypeName];

        eventSource.addEventListener(
          eventTypeName,
          generateEventHandler(eventType, subscriber)
        );

        eventSource.onerror = (event) => {
          this.logger?.error?.({ event }, 'event source error');
        };
      }

      eventSource.connect();

      return () => {
        eventSource.close();
      };
    });
  }

  registerProblem(type: ClassType<Problem>): void {
    const problemType = (type as unknown) as ProblemType;
    if (!problemType.TYPE) {
      throw Error(
        `Problem type ${type} doesn't have required static 'TYPE' property`
      );
    }
    this.problemTypes.set(problemType.TYPE, type);
  }
}
