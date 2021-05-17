import { EventInfo, EventParser } from 'event-parser';
import { EMPTY, Observable, of, Subscription } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { validate } from './fetch';
import { Logger } from './logger';
import { MediaType } from './media-type';
import { ExtEventSource } from './request-factory';
import { fromStream } from './util/stream-rxjs';

export class FetchEventSource extends EventTarget implements ExtEventSource {
  private static LAST_EVENT_ID_HEADER = 'Last-Event-ID';
  private static MAX_RETRY_TIME_MULTIPLE = 30;
  private static EVENT_TIMEOUT_DEFAULT = 75;
  private static EVENT_TIMEOUT_CHECK_INTERVAL = 2;

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
  private connectionSubscription?: Subscription;
  private retryTime = 100;
  private retryAttempt = 0;
  private connectionAttemptTime = 0;
  private reconnectTimeoutHandle?: number;
  private lastEventId?: string;
  private logger?: Logger;
  private readonly eventTimeout?: number;
  private eventTimeoutCheckHandle?: number;
  private lastEventReceivedTime = 0;
  private eventParser = new EventParser();

  constructor(
    url: string,
    eventSourceInit?: EventSourceInit & {
      adapter?: (url: string, requestInit: RequestInit) => Observable<Request>;
      eventTimeout?: number;
      logger?: Logger;
    }
  ) {
    super();
    this.url = url;
    this.adapter =
      eventSourceInit?.adapter ??
      ((_url, requestInit) => of(new Request(_url, requestInit)));
    this.eventTimeout =
      eventSourceInit?.eventTimeout ??
      FetchEventSource.EVENT_TIMEOUT_DEFAULT * 1000;
    this.logger = eventSourceInit?.logger;
  }

  //
  // Connect
  //

  connect(): void {
    if (this.readyState === this.CONNECTING || this.readyState === this.OPEN) {
      // this.logger?.debug?.('skipping connect', { state: this.readyState });
      return;
    }

    this.internalConnect();
  }

  private internalConnect() {
    this.logger?.debug?.('connecting');

    this.readyState = this.CONNECTING;

    const headers = new Headers({
      accept: MediaType.EventStream.toString(),
    });
    if (this.lastEventId) {
      headers.append(FetchEventSource.LAST_EVENT_ID_HEADER, this.lastEventId);
    }

    const abort = new AbortController();

    const requestInit: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'follow',
      signal: abort.signal,
    };

    this.connectionAttemptTime = Date.now();

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
        map((value) => this.receivedData(value))
      )
      .subscribe({
        error: (error: unknown) => {
          abort.abort();
          this.receivedError(error);
        },
        complete: () => {
          abort.abort();
          this.receivedComplete();
        },
      });
    this.connectionSubscription.add(() => abort.abort());
  }

  //
  // Close
  //

  close(): void {
    this.logger?.debug?.('close requested');

    this.readyState = this.CLOSED;

    this.internalClose();
  }

  private internalClose() {
    this.connectionSubscription?.unsubscribe();
    this.connectionSubscription = undefined;

    this.clearReconnect();

    this.stopEventTimeoutCheck();
  }

  //
  // Event Timeout
  //

  private startEventTimeoutCheck(lastEventReceivedTime: number) {
    this.stopEventTimeoutCheck();

    if (!this.eventTimeout) {
      return;
    }

    this.lastEventReceivedTime = lastEventReceivedTime;

    // this.logger?.debug?.('starting event timeout checks');

    this.eventTimeoutCheckHandle = window.setInterval(
      () => this.checkEventTimeout(),
      FetchEventSource.EVENT_TIMEOUT_CHECK_INTERVAL * 1000
    );
  }

  private stopEventTimeoutCheck() {
    // this.logger?.debug?.('stopping event timeout checks');

    if (this.eventTimeoutCheckHandle) {
      clearInterval(this.eventTimeoutCheckHandle);
    }
    this.eventTimeoutCheckHandle = undefined;
  }

  private checkEventTimeout() {
    if (!this.eventTimeout) {
      this.stopEventTimeoutCheck();
      return;
    }

    // this.logger?.debug?.('checking event timeout');

    // Check elapsed time since last received event
    const elapsed = Date.now() - this.lastEventReceivedTime;
    if (elapsed > this.eventTimeout) {
      this.logger?.debug?.('event timeout reached', {
        elapsed,
      });

      this.internalClose();

      this.scheduleReconnect();
    }
  }

  //
  // Connection Handlers
  //

  private receivedHeaders() {
    if (this.readyState !== this.CONNECTING) {
      this.logger?.error?.('Invalid readyState for receiveHaders', {
        readyState: this.readyState,
      });

      this.internalClose();
      this.scheduleReconnect();
      return;
    }

    this.logger?.debug?.('opened');

    this.retryAttempt = 0;
    this.readyState = this.OPEN;

    // Start event timeout check, treating this
    // connect as last time we received an event
    this.startEventTimeoutCheck(Date.now());

    const event = new Event('open');
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  private receivedData(buffer: ArrayBuffer) {
    if (this.readyState !== this.OPEN) {
      this.logger?.error?.('Invalid readyState for receiveData', {
        readyState: this.readyState,
      });

      this.internalClose();
      this.scheduleReconnect();
      return;
    }

    this.logger?.debug?.('Received data', { length: validate.length });

    this.eventParser.process(buffer, this.dispatchParsedEvent);
  }

  private receivedError(error: unknown) {
    if (
      error instanceof DOMException &&
      error.code === DOMException.ABORT_ERR
    ) {
      // this.logger?.debug?.('aborted');

      return;
    }

    this.logger?.debug?.('received error', { error });

    this.scheduleReconnect();

    const event = new Event('error');
    ((event as unknown) as Record<string, unknown>).error = error;

    this.onerror?.(event);
  }

  private receivedComplete() {
    if (this.readyState !== this.CLOSED) {
      this.logger?.debug?.('unexpected complete');

      this.scheduleReconnect();

      return;
    }

    this.logger?.debug?.('closed');
  }

  //
  // Reconnection
  //

  private scheduleReconnect() {
    // calculate total delay
    const backOffDelay = Math.pow(this.retryAttempt, 2) * this.retryTime;
    let retryDelay = Math.min(
      this.retryTime + backOffDelay,
      this.retryTime * FetchEventSource.MAX_RETRY_TIME_MULTIPLE
    );

    // Adjust delay by amount of time last connect
    // cycle took, except on the first attempt
    if (this.retryAttempt > 0) {
      const connectionTime = Date.now() - this.connectionAttemptTime;
      // Ensure delay is at least as large as
      // minimum retry time interval
      retryDelay = Math.max(retryDelay - connectionTime, this.retryTime);
    }

    this.retryAttempt++;

    this.logger?.debug?.('scheduling reconnect', { retryDelay });

    this.reconnectTimeoutHandle = window.setTimeout(
      () => this.internalConnect(),
      retryDelay
    );
  }

  private clearReconnect() {
    if (this.reconnectTimeoutHandle) {
      clearTimeout(this.reconnectTimeoutHandle);
    }
    this.reconnectTimeoutHandle = undefined;
  }

  //
  // Event Dispatch
  //

  private dispatchParsedEvent = (eventInfo: EventInfo) => {
    if (eventInfo.retry) {
      const retryTime = Number.parseInt(eventInfo.retry, 10);

      if (
        Number.isSafeInteger(retryTime) &&
        eventInfo.id == null &&
        eventInfo.event == null &&
        eventInfo.data == null
      ) {
        this.logger?.debug?.('updating retry timeout', { retryTime });

        this.retryTime = retryTime;
      } else {
        this.logger?.debug?.('ignoring invalid retry timeout event', {
          eventInfo,
        });
      }

      return;
    }

    this.lastEventReceivedTime = Date.now();
    this.lastEventId = eventInfo.id ?? this.lastEventId;

    // Skip empty or comment only events
    if (!eventInfo.id && !eventInfo.event && !eventInfo.data) {
      // this.logger?.debug?.('skipping empty event');
      return;
    }

    // Dispatch event
    const event = new MessageEvent(eventInfo.event ?? 'message', {
      data: eventInfo.data,
      lastEventId: this.lastEventId,
    });

    this.onmessage?.(event);
    this.dispatchEvent(event);
  };
}
