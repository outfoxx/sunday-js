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

import { EMPTY, map, Observable, of, Subscription, switchMap, tap } from 'rxjs';
import { EventInfo, EventParser } from './event-parser';
import { validate } from './fetch';
import { Logger } from './logger';
import { MediaType } from './media-type';
import { ExtEventSource } from './request-factory';
import { unknownSet } from './util/any';
import { fromStream } from './util/stream-rxjs';

export interface FetchEventSource {
  addEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof EventSourceEventMap>(
    type: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (this: EventSource, ev: EventSourceEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
}

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

  get retryTime(): number {
    return this.internalRetryTime;
  }

  private adapter: (
    url: string,
    requestInit: RequestInit,
  ) => Observable<Request>;
  private connectionSubscription?: Subscription;
  private internalRetryTime = 100;
  private retryAttempt = 0;
  private connectionAttemptTime = 0;
  private connectionOrigin?: string;
  private reconnectTimeoutHandle?: number;
  private lastEventId?: string;
  private logger?: Logger;
  private readonly eventTimeout?: number;
  private eventTimeoutCheckHandle?: number;
  private lastEventReceivedTime = 0;
  private eventParser = new EventParser();
  private readonly externalAbortController?: AbortController;

  constructor(
    url: string,
    eventSourceInit?: EventSourceInit & {
      adapter?: (url: string, requestInit: RequestInit) => Observable<Request>;
      eventTimeout?: number;
      logger?: Logger;
      abortController?: AbortController;
    },
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
    this.externalAbortController = eventSourceInit?.abortController;
  }

  //
  // Connect
  //

  connect(): void {
    if (this.readyState === this.CONNECTING || this.readyState === this.OPEN) {
      this.logger?.trace?.('skipping connect', { state: this.readyState });
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

    const abortController =
      this.externalAbortController ?? new AbortController();

    const requestInit: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'follow',
      signal: abortController.signal,
    };

    this.connectionAttemptTime = Date.now();

    this.connectionSubscription = this.adapter(this.url, requestInit)
      .pipe(
        switchMap((request) => fetch(request)),
        switchMap((response) => validate(response, true)),
        tap((response) => this.receivedHeaders(response)),
        switchMap((response) => {
          const body = response.body;
          if (!body) {
            return EMPTY;
          }

          return fromStream(body);
        }),
        map((value) => this.receivedData(value)),
      )
      .subscribe({
        error: (error: unknown) => {
          this.receivedError(error);
        },
        complete: () => {
          this.receivedComplete();
        },
      });
    this.connectionSubscription.add(() => {
      abortController.abort();
    });
  }

  //
  // Close
  //

  close(): void {
    if (this.readyState === this.CLOSED) {
      return;
    }

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

    this.logger?.trace?.('starting event timeout checks');

    this.eventTimeoutCheckHandle = window.setInterval(
      () => this.checkEventTimeout(),
      FetchEventSource.EVENT_TIMEOUT_CHECK_INTERVAL * 1000,
    );
  }

  private stopEventTimeoutCheck() {
    if (this.eventTimeoutCheckHandle) {
      this.logger?.trace?.('stopping event timeout checks');

      clearInterval(this.eventTimeoutCheckHandle);
    }

    this.eventTimeoutCheckHandle = undefined;
  }

  private checkEventTimeout() {
    if (!this.eventTimeout) {
      this.stopEventTimeoutCheck();
      return;
    }

    this.logger?.trace?.('checking event timeout');

    // Check elapsed time since last received event
    const elapsed = Date.now() - this.lastEventReceivedTime;
    if (elapsed > this.eventTimeout) {
      this.logger?.debug?.('event timeout reached', {
        elapsed,
      });
      this.fireErrorEvent(Error('EventTimeout'));

      this.scheduleReconnect();
    }
  }

  //
  // Connection Handlers
  //

  private receivedHeaders(response: Response) {
    if (this.readyState !== this.CONNECTING) {
      this.logger?.error?.('invalid readyState for receivedHeaders', {
        readyState: this.readyState,
      });

      this.fireErrorEvent(Error('InvalidState'));

      this.scheduleReconnect();
      return;
    }

    this.logger?.debug?.('opened');

    this.connectionOrigin = response.url;
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
      this.logger?.error?.('invalid readyState for receiveData', {
        readyState: this.readyState,
      });

      this.fireErrorEvent(Error('InvalidState'));

      this.scheduleReconnect();
      return;
    }

    this.logger?.debug?.('received data', { length: buffer.byteLength });

    this.eventParser.process(buffer, this.dispatchParsedEvent);
  }

  private receivedError(error: unknown) {
    if (this.readyState === this.CLOSED) {
      return;
    }

    this.logger?.debug?.('received error', { error });
    this.fireErrorEvent(error);

    if (this.readyState !== this.CLOSED) {
      this.scheduleReconnect();
    }
  }

  private receivedComplete() {
    if (this.readyState == this.CLOSED) {
      return;
    }

    this.logger?.debug?.('received complete');

    this.scheduleReconnect();
  }

  //
  // Reconnection
  //

  private scheduleReconnect() {
    this.internalClose();

    // calculate total delay
    const backOffDelay = Math.pow(this.retryAttempt, 2) * this.retryTime;
    let retryDelay = Math.min(
      this.retryTime + backOffDelay,
      this.retryTime * FetchEventSource.MAX_RETRY_TIME_MULTIPLE,
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
    this.readyState = this.CONNECTING;

    this.logger?.debug?.('scheduling reconnect', { retryDelay });

    this.reconnectTimeoutHandle = window.setTimeout(
      () => this.internalConnect(),
      retryDelay,
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
    this.lastEventReceivedTime = Date.now();

    if (eventInfo.retry) {
      const retryTime = Number.parseInt(eventInfo.retry, 10);

      if (Number.isSafeInteger(retryTime)) {
        this.logger?.debug?.('updating retry timeout', { retryTime });

        this.internalRetryTime = retryTime;
      } else {
        this.logger?.debug?.('ignoring invalid retry timeout event', {
          eventInfo,
        });
      }
    }

    // skip empty events
    if (
      eventInfo.id == null &&
      eventInfo.event == null &&
      eventInfo.data == null
    ) {
      // skip empty event
      return;
    }

    // Save last-event-id if the new id is valid
    if (eventInfo.id != null) {
      // Check for NULL as it is not allowed
      if (eventInfo.id.indexOf('\0') == -1) {
        this.lastEventId = eventInfo.id;
      } else {
        this.logger?.debug?.(
          'event id contains null, unable to use for last-event-id',
        );
      }
    }

    // Dispatch event
    const event = new MessageEvent(eventInfo.event ?? 'message', {
      data: eventInfo.data,
      lastEventId: this.lastEventId,
      origin: this.connectionOrigin,
    });

    this.onmessage?.(event);
    this.dispatchEvent(event);
  };

  fireErrorEvent(error: unknown): void {
    const event = new Event('error');
    unknownSet(event, 'error', error);
    this.onerror?.(event);
  }
}
