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
  private static EVENT_TIMEOUT_CHECK_INTERVAL = 1;

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
  private decoder: TextDecoder = new TextDecoder('utf-8');
  private retryTime = 100;
  private retryAttempt = 0;
  private connectionAttemptTime = 0;
  private lastEventId?: string;
  private logger?: Logger;
  private unprocessedBuffers: ArrayBuffer[] = [];
  private unprocessedText = '';
  private eventTimeout?: number;
  private eventTimeoutCheckHandle?: number;
  private lastEventTime?: number;

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
      accept: MediaType.EVENT_STREAM,
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

  close(): void {
    this.logger?.debug?.('closed');

    this.readyState = this.CLOSED;

    this.internalClose();
  }

  private internalClose() {
    this.connectionSubscription?.unsubscribe();
    this.connectionSubscription = undefined;

    this.stopEventTimeoutCheck();
  }

  private startEventTimeoutCheck() {
    if (!this.eventTimeout) {
      return;
    }

    // this.logger?.debug?.('starting event timeout checks');

    this.eventTimeoutCheckHandle = setInterval(
      () => this.checkEventTimeout(),
      FetchEventSource.EVENT_TIMEOUT_CHECK_INTERVAL
    );
  }

  private stopEventTimeoutCheck() {
    // this.logger?.debug?.('stopping event timeout checks');

    clearInterval(this.eventTimeoutCheckHandle);
  }

  private checkEventTimeout() {
    if (!this.eventTimeout) {
      this.stopEventTimeoutCheck();
      return;
    }

    // this.logger?.debug?.('checking event timeout');

    // Check elapsed time since last received event
    const elapsed = Date.now() - (this.lastEventTime ?? 0);
    if (elapsed > this.eventTimeout) {
      this.logger?.debug?.('event timeout reached', {
        elapsed,
      });

      this.internalClose();

      this.scheduleReconnect();
    }
  }

  private receivedHeaders() {
    if (this.readyState !== this.CONNECTING) {
      this.close();
      throw Error('Invalid readyState');
    }

    this.logger?.debug?.('connected');

    this.retryAttempt = 0;
    this.readyState = this.OPEN;

    this.startEventTimeoutCheck();

    const event = new Event('open');
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  private receivedData(value: ArrayBuffer) {
    this.unprocessedBuffers.push(value);

    while (this.unprocessedBuffers.length) {
      const latest = this.unprocessedBuffers[
        this.unprocessedBuffers.length - 1
      ];
      const latestBytes = new Uint8Array(latest);
      const latestNewLine = latestBytes.indexOf(0xa);
      if (latestNewLine == -1) {
        return;
      }
      const nextLine = latestNewLine + 1;

      const readyToProcess = this.unprocessedBuffers.slice(0, -1);
      readyToProcess.push(latest.slice(0, nextLine));

      const leftOver = latest.slice(nextLine);
      this.unprocessedBuffers = leftOver.byteLength ? [leftOver] : [];

      let text = '';
      for (const buffer of readyToProcess) {
        text += this.decoder.decode(buffer, { stream: true });
      }

      this.receivedText(text);
    }
  }

  private receivedText(text: string) {
    // Clear out carriage returns
    text = text.replace('\r\n', '\n');

    this.unprocessedText += text;

    const eventStrings = this.extractEventStrings();

    this.parseEvents(eventStrings);
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
    this.logger?.debug?.('received complete');

    if (this.readyState !== this.CLOSED) {
      this.scheduleReconnect();

      return;
    }
  }

  private scheduleReconnect() {
    // calculate total delay
    const backOffDelay = Math.pow(this.retryAttempt, 2) * this.retryTime;
    let retryDelay = Math.min(
      this.retryTime + backOffDelay,
      this.retryTime * FetchEventSource.MAX_RETRY_TIME_MULTIPLE
    );

    // Adjust delay by amount of time last reconnect cycle took, except
    // on the first attempt
    if (this.retryAttempt > 0) {
      const connectionTime = Date.now() - this.connectionAttemptTime;
      retryDelay = Math.max(retryDelay - connectionTime, 0);
    }

    this.retryAttempt++;

    this.logger?.debug?.('scheduling reconnect', { retryDelay });

    setTimeout(() => this.internalConnect(), retryDelay);
  }

  private extractEventStrings(): string[] {
    const received = this.unprocessedText;
    if (!received.length) {
      return [];
    }

    const eventStrings = received.split(EVENT_SEPARATOR);

    const last = eventStrings.pop();
    this.unprocessedText = last?.length ? last : '';

    return eventStrings;
  }

  private parseEvents(eventStrings: string[]) {
    for (const eventString of eventStrings) {
      const line = eventString.trim();
      if (!line.length) {
        continue;
      }

      const parsedEvent = FetchEventSource.parseEvent(eventString);

      if (parsedEvent.retry) {
        const retryTime = Number.parseInt(parsedEvent.retry, 10);

        if (
          Number.isSafeInteger(retryTime) &&
          parsedEvent.id == null &&
          parsedEvent.event == null &&
          parsedEvent.data == null
        ) {
          this.logger?.debug?.('updating retry timeout', { retryTime });

          this.retryTime = retryTime;
        } else {
          this.logger?.debug?.('ignoring invalid retry timeout event', {
            parsedEvent,
          });
        }

        continue;
      }

      this.lastEventTime = Date.now();
      this.lastEventId = parsedEvent.id ?? this.lastEventId;

      // Skip empty or comment only events
      if (!parsedEvent.id && !parsedEvent.event && !parsedEvent.data) {
        // this.logger?.debug?.('skipping empty event');
        continue;
      }

      // Dispatch event
      const event = new MessageEvent(parsedEvent.event ?? 'message', {
        data: parsedEvent.data,
        lastEventId: this.lastEventId,
      });

      this.onmessage?.(event);
      this.dispatchEvent(event);
    }
  }

  private static parseEvent(eventString: string): EventInfo {
    const event: EventInfo = {};

    for (const line of eventString.split('\n')) {
      const fields = line.split(':');
      const key = fields[0].trim();
      const value = fields.splice(1).join(':');

      switch (key) {
        case 'retry':
          event.retry = value;
          break;
        case '':
          // comment do nothing
          break;
        default:
          (event as Record<string, string>)[key] = value.trim();
      }
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
