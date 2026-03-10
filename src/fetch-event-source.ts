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

import { EventInfo, EventParser } from './event-parser.js';
import { validate } from './fetch.js';
import { levelLogger, Logger, LogLevel } from './logger.js';
import { MediaType } from './media-type.js';
import { ExtEventSource } from './request-factory.js';
import { unknownSet } from './util/unknowns.js';

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
  private static readonly LAST_EVENT_ID_HEADER = 'Last-Event-ID';
  private static readonly MAX_RETRY_TIME_MULTIPLIER = 12;
  private static readonly RETRY_EXPONENT = 2.6;
  private static readonly EVENT_TIMEOUT_DEFAULT = 120 * 1000;
  private static readonly EVENT_TIMEOUT_CHECK_INTERVAL_DEFAULT = 2 * 1000;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState: number = this.CLOSED;
  url: string;
  withCredentials = false;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;

  get retryTime(): number {
    return this.internalRetryTime;
  }

  private readonly adapter: (
    url: string,
    requestInit: RequestInit,
  ) => Promise<Request>;
  private readonly signal?: AbortSignal;
  private connectionAbortController?: AbortController;
  private connectionReader?: ReadableStreamDefaultReader<Uint8Array>;
  private externalAbortSignal?: AbortSignal;
  private externalAbortHandler?: () => void;
  private internalRetryTime = 100;
  private retryAttempt = 0;
  private connectionAttemptTime: number | undefined;
  private connectionOrigin?: string;
  private reconnectTimeoutHandle?: ReturnType<typeof setTimeout>;
  private lastEventId?: string;
  private readonly logger?: Logger;
  private readonly eventTimeout?: number;
  private readonly eventTimeoutCheckInterval: number;
  private eventTimeoutCheckHandle?: ReturnType<typeof setInterval>;
  private lastEventReceivedTime = 0;
  private readonly eventParser = new EventParser();

  constructor(
    url: string,
    eventSourceInit?: EventSourceInit & {
      adapter?: (url: string, requestInit: RequestInit) => Promise<Request>;
      signal?: AbortSignal;
      eventTimeout?: number;
      eventTimeoutCheckInterval?: number;
      logger?: Logger;
    },
  ) {
    super();
    this.url = url;
    this.adapter =
      eventSourceInit?.adapter ??
      ((_url, requestInit) => Promise.resolve(new Request(_url, requestInit)));
    this.signal = eventSourceInit?.signal;
    this.eventTimeout =
      eventSourceInit?.eventTimeout ?? FetchEventSource.EVENT_TIMEOUT_DEFAULT;
    this.eventTimeoutCheckInterval =
      eventSourceInit?.eventTimeoutCheckInterval ??
      FetchEventSource.EVENT_TIMEOUT_CHECK_INTERVAL_DEFAULT;
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

    this.abortConnection();

    const connectionAbortController = new AbortController();
    this.connectionAbortController = connectionAbortController;

    const externalSignal = this.signal;
    if (externalSignal instanceof AbortSignal) {
      this.externalAbortSignal = externalSignal;
      this.externalAbortHandler = () => {
        this.connectionAbortController?.abort();
      };
      externalSignal.addEventListener('abort', this.externalAbortHandler);
    }

    const requestInit: RequestInit = {
      headers,
      cache: 'no-store',
      redirect: 'follow',
      signal: connectionAbortController.signal,
    };

    this.connectionAttemptTime = Date.now();

    void this.adapter(this.url, requestInit)
      .then(async (request) => {
        const response = await fetch(request, {
          signal: connectionAbortController.signal,
        });

        const validatedResponse = await validate(response, true, undefined, this.logger);

        this.receivedHeaders(validatedResponse);

        const body = validatedResponse.body;
        if (!body) {
          this.receivedComplete();
          return;
        }

        const reader = body.getReader();
        this.connectionReader = reader;

        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }
          this.receivedData(result.value);
        }

        this.receivedComplete();
      })
      .catch((error: unknown) => {
        this.receivedError(error);
      })
      .finally(() => {
        if (this.connectionReader) {
          try {
            this.connectionReader.releaseLock();
          } catch {
            // ignore
          }
        }
        this.connectionReader = undefined;
      });
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
    this.abortConnection();

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

    this.eventTimeoutCheckHandle = setInterval(
      () => this.checkEventTimeout(),
      this.eventTimeoutCheckInterval,
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
      this.fireErrorEvent(new Error('EventTimeout'));

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

      this.fireErrorEvent(new Error('InvalidState'));

      this.scheduleReconnect();
      return;
    }

    this.logger?.info?.('opened');

    this.connectionOrigin = response.url;
    this.retryAttempt = 0;
    this.readyState = this.OPEN;

    // Start event timeout check, treating this connection
    // as the last time we received an event
    this.startEventTimeoutCheck(Date.now());

    const event = new Event('open');
    this.onopen?.(event);
    this.dispatchEvent(event);
  }

  private receivedData(buffer: ArrayBuffer | ArrayBufferView | undefined) {
    if (this.readyState !== this.OPEN) {
      this.logger?.error?.('invalid readyState for receiveData', {
        readyState: this.readyState,
      });

      this.fireErrorEvent(new Error('InvalidState'));

      this.scheduleReconnect();
      return;
    }

    if (!buffer) {
      return;
    }

    const slicedBuffer =
      buffer instanceof ArrayBuffer
        ? buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const arrayBuffer =
      slicedBuffer instanceof ArrayBuffer
        ? slicedBuffer
        : Uint8Array.from(new Uint8Array(slicedBuffer)).buffer;

    this.logger?.debug?.('received data', { length: arrayBuffer.byteLength });

    this.eventParser.process(arrayBuffer, this.dispatchParsedEvent);
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

    this.reconnectTimeoutHandle = setTimeout(
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

    // Adjust delay by the amount of time the last connection
    // cycle took, except on the first attempt
    if (retryAttempt > 0) {
      retryDelay -= lastConnectTime;

      // Ensure the delay is at least as large as
      // the minimum retry time interval
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

  private readonly dispatchParsedEvent = (eventInfo: EventInfo) => {
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
      // skip empty events
      this.logger?.trace?.('skipping empty event');
      return;
    }

    // Save last-event-id if the new id is valid
    if (eventInfo.id != null) {
      // Check for NULL as it is not allowed
      if (!eventInfo.id.includes('\0')) {
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

  private abortConnection() {
    if (this.connectionAbortController) {
      this.connectionAbortController.abort();
    }
    this.connectionAbortController = undefined;

    if (this.connectionReader) {
      void this.connectionReader.cancel()
               .catch(() => this.logger?.warn?.('failed to cancel connection reader'));
      try {
        this.connectionReader.releaseLock();
      } catch {
        // ignore
      }
    }
    this.connectionReader = undefined;

    if (this.externalAbortSignal && this.externalAbortHandler) {
      this.externalAbortSignal.removeEventListener(
        'abort',
        this.externalAbortHandler,
      );
    }
    this.externalAbortSignal = undefined;
    this.externalAbortHandler = undefined;
  }
}
