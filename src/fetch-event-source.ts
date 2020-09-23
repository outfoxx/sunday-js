import { EMPTY, Observable, of, Unsubscribable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { validate } from './fetch';
import { Logger } from './logger';
import { MediaType } from './media-type';
import { ExtEventSource } from './request-factory';
import { fromStream } from './util/stream-rxjs';

export class FetchEventSource extends EventTarget implements ExtEventSource {
  private static LAST_EVENT_ID_HEADER = 'last-event-id';

  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;

  readyState: number = this.CLOSED;
  url: string;
  withCredentials = false;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;

  private adapter: (
    url: string,
    requestInit: RequestInit
  ) => Observable<Request>;
  private connectionFetch?: AbortController;
  private connectionSubscription?: Unsubscribable;
  private decoder: TextDecoder = new TextDecoder('utf-8');
  private received?: string;
  private retryTime = 3000;
  private lastEventId?: string;
  private logger: Logger;

  constructor(
    url: string,
    eventSourceInit?: EventSourceInit & {
      adapter?: (url: string, requestInit: RequestInit) => Observable<Request>;
      logger?: Logger;
    }
  ) {
    super();
    this.url = url;
    this.adapter =
      eventSourceInit?.adapter ??
      ((_url, requestInit) => of(new Request(_url, requestInit)));
    this.logger = eventSourceInit?.logger ?? console;
  }

  connect(): void {
    if (this.readyState === this.CONNECTING || this.readyState === this.OPEN) {
      return;
    }

    this.readyState = this.CONNECTING;

    const headers = new Headers({
      accept: MediaType.EVENT_STREAM,
    });
    if (this.lastEventId) {
      headers.append(FetchEventSource.LAST_EVENT_ID_HEADER, this.lastEventId);
    }

    this.connectionFetch = new AbortController();

    const requestInit: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'follow',
      signal: this.connectionFetch.signal,
    };

    this.connectionSubscription = this.adapter(this.url, requestInit)
      .pipe(
        switchMap((request) => fetch(request)),
        switchMap((response) => validate(response, true)),
        tap(() => this.receivedHeaders()),
        switchMap((response) => {
          const body = response.body;
          if (!body) {
            return EMPTY;
          }

          return fromStream(body);
        }),
        tap((value) => this.receivedData(value))
      )
      .subscribe({
        error: (error: unknown) => {
          this.connectionFetch?.abort();
          this.receivedError(error);
        },
        complete: () => {
          this.connectionFetch?.abort();
          this.receivedComplete();
        },
      });
  }

  close(): void {
    this.readyState = this.CLOSED;

    this.connectionSubscription?.unsubscribe();
    this.connectionSubscription = undefined;

    this.connectionFetch?.abort();
    this.connectionFetch = undefined;
  }

  private receivedHeaders() {
    if (this.readyState !== this.CONNECTING) {
      this.close();
      throw Error('Invalid readyState');
    }

    this.readyState = this.OPEN;

    this.onopen?.(new Event('open'));
  }

  private receivedData(value: ArrayBuffer) {
    let text = this.decoder.decode(value, { stream: true });
    if (!text.length) {
      return;
    }

    // Clear out carriage returns
    text = text.replace('\r\n', '\n');

    this.received = (this.received ?? '') + text;

    const eventStrings = this.extractEventStrings();
    this.parseEvents(eventStrings);
  }

  private receivedError(error: unknown) {
    if (
      error instanceof DOMException &&
      error.code === DOMException.ABORT_ERR
    ) {
      this.logger.debug?.('aborted');

      return;
    }

    this.logger.debug?.({ err: error }, 'received error');

    this.scheduleReconnect();

    const event = new Event('error');
    ((event as unknown) as Record<string, unknown>).error = error;

    this.onerror?.(event);
  }

  private receivedComplete() {
    this.logger.debug?.('received complete');

    if (this.readyState !== this.CLOSED) {
      this.scheduleReconnect();

      return;
    }

    this.logger.debug?.('disconnected');
  }

  private scheduleReconnect() {
    this.logger.debug?.({ retryTime: this.retryTime }, 'scheduling reconnect');

    setTimeout(() => this.connect(), this.retryTime);
  }

  private extractEventStrings(): string[] {
    const received = this.received;
    if (!received) {
      return [];
    }

    const eventStrings = received.split(EVENT_SEPARATOR);

    const last = eventStrings.pop();
    this.received = last?.length ? last : undefined;

    return eventStrings;
  }

  private parseEvents(eventStrings: string[]) {
    for (const eventString of eventStrings) {
      const line = eventString.trim();
      if (!line.length) {
        continue;
      }

      const parsedEvent = this.parseEvent(eventString);

      if (parsedEvent.retry) {
        if (
          parsedEvent.id != null ||
          parsedEvent.event != null ||
          parsedEvent.data != null
        ) {
          this.logger.debug?.(
            { parsedEvent },
            'ignoring invalid retry timeout event'
          );
          continue;
        }

        const retryTime = Number.parseInt(parsedEvent.retry, 10);
        this.retryTime = retryTime ?? this.retryTime;

        continue;
      }

      this.lastEventId = parsedEvent.id ?? this.lastEventId;

      const event = new MessageEvent(parsedEvent.event ?? 'message', {
        data: parsedEvent.data,
        lastEventId: this.lastEventId,
      });

      if (event.type === 'message') {
        this.onmessage?.(event);
      } else {
        this.dispatchEvent(event);
      }
    }
  }

  private parseEvent(eventString: string): EventInfo {
    const event: EventInfo = {};

    for (const line of eventString.split('\n')) {
      const fields = line.split(':');
      const key = fields[0];
      const value = fields.splice(1).join(':');

      (event as Record<string, string>)[key] = value.trim();
    }

    return event;
  }
}

const EVENT_SEPARATOR = /\n\n/;

interface EventInfo {
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
}
