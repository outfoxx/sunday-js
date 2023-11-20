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

import { EMPTY, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { fromReadableStreamLike } from 'rxjs/internal/observable/innerFrom';
import { EventInfo, EventParser } from './event-parser';
import { validate } from './fetch';
import { levelLogger, Logger, LogLevel } from './logger';
import { MediaType } from './media-type';
import { ExtEventSource } from './request-factory';
import { unknownGet, unknownSet } from './util/any';

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
  private static MAX_RETRY_TIME_MULTIPLIER = 12;
  private static RETRY_EXPONENT = 2.6;
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
  private connectionAttemptTime: number | undefined;
  private connectionOrigin?: string;
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
    this.logger = levelLogger(LogLevel.Info, eventSourceInit?.logger);
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

    this.connectionSubscription?.unsubscribe();
    this.connectionSubscription = new Subscription();

    // Abort when connection is unsubscribed
    const unsubscribeAbortController = new AbortController();
    this.connectionSubscription.add(() => unsubscribeAbortController.abort());

    // Purely for testing purposes, allow an external signal to abort the fetch
    const externalSignal = unknownGet(this, 'signal');
    if (externalSignal instanceof AbortSignal) {
      const externalSignalLink = () => unsubscribeAbortController.abort();

      externalSignal.addEventListener('abort', externalSignalLink);
      this.connectionSubscription.add(() =>
        externalSignal?.removeEventListener('abort', externalSignalLink),
      );
    }

    const requestInit: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'follow',
    };

    this.connectionAttemptTime = Date.now();

    this.connectionSubscription.add(
      this.adapter(this.url, requestInit)
        .pipe(
          switchMap(async (request) => {
            // Fetch explicitly using the unsubscribe
            // abort controller signal
            const response = await fetch(request, {
              signal: unsubscribeAbortController.signal,
            });

            const validatedResponse = await validate(response, true);

            this.receivedHeaders(validatedResponse);

            return validatedResponse;
          }),
          switchMap((response) => {
            // If response has no body, return empty to complete immediately
            const body = response.body;
            if (!body) {
              return EMPTY;
            }

            return fromReadableStreamLike(body);
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
        }),
    );
  }

  //
  // Close
  //

  close(): void {
    if (this.readyState === this.CLOSED) {
      return;
    }

    this.logger?.debug?.('closing');

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

  private updateLastEventReceived(time: number = Date.now()) {
    this.lastEventReceivedTime = time;
  }

  private startEventTimeoutCheck(lastEventReceivedTime: number) {
    this.stopEventTimeoutCheck();

    if (!this.eventTimeout) {
      return;
    }

    this.updateLastEventReceived(lastEventReceivedTime);

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

    this.logger?.info?.('opened');

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

    const lastConnectionTime = this.connectionAttemptTime
      ? Date.now() - this.connectionAttemptTime
      : 0;

    const retryDelay = FetchEventSource.calculateRetryTime(
      this.retryAttempt,
      this.retryTime,
      lastConnectionTime,
    );

    this.retryAttempt++;
    this.readyState = this.CONNECTING;

    this.logger?.debug?.('scheduling reconnect', { retryDelay });

    this.reconnectTimeoutHandle = window.setTimeout(
      () => this.internalConnect(),
      retryDelay,
    );
  }

  private static calculateRetryTime(
    retryAttempt: number,
    retryTime: number,
    lastConnectTime: number,
  ): number {
    const retryMultiplier = Math.min(
      retryAttempt,
      this.MAX_RETRY_TIME_MULTIPLIER,
    );

    // calculate total delay
    let retryDelay = Math.pow(retryMultiplier, this.RETRY_EXPONENT) * retryTime;

    // Adjust delay by amount of time last connect
    // cycle took, except on the first attempt
    if (retryAttempt > 0) {
      retryDelay -= lastConnectTime;

      // Ensure delay is at least as large as
      // minimum retry time interval
      retryDelay = Math.max(retryDelay, retryTime);
    }

    return retryDelay;
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
    this.updateLastEventReceived();

    if (eventInfo.retry) {
      const retryTime = Number.parseInt(eventInfo.retry, 10);

      if (Number.isSafeInteger(retryTime)) {
        this.logger?.debug?.('updating retry timeout', { retryTime });

        this.internalRetryTime = retryTime;
      } else {
        this.logger?.warn?.('ignoring invalid retry timeout event', {
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
      this.logger?.trace?.('skipping empty event');
      return;
    }

    // Save last-event-id if the new id is valid
    if (eventInfo.id != null) {
      // Check for NULL as it is not allowed
      if (eventInfo.id.indexOf('\0') == -1) {
        this.lastEventId = eventInfo.id;
      } else {
        this.logger?.warn?.(
          'event id contains NULL byte, unable to use for last-event-id',
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
