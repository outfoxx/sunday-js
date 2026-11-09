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

import { nativeFetch } from './util/native-fetch.js';
import { copyRequest } from './fetch-copy.js';
import {
  isRequestStopped,
  requestFailure,
} from './request-cancellation-error.js';
import { discardBody, withAbort } from './util/abort.js';
import { RequestValidationError } from './request-validation-error.js';
import {
  AuthorizationRequiredError,
  TokenProviderError,
} from './token-provider.js';
import {
  EventInfo,
  EventControl,
  EventParser,
  parseEventMilliseconds,
} from './event-parser.js';
import { validate } from './fetch.js';
import { levelLogger, Logger, LogLevel } from './logger.js';
import { MediaType } from './media-type.js';
import { ExtEventSource } from './transport.js';
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
  private static readonly RETRY_TIME_DEFAULT = 500;
  // Longer delays overflow native timers into immediate callbacks.
  private static readonly MAX_TIMER_DELAY = 0x7fffffff;
  private static readonly RETRY_MAX_MULTIPLIER_DEFAULT = 30;
  private static readonly KEEPALIVE_TIMEOUT_MULTIPLIER = 3;
  private static readonly KEEPALIVE_TIMEOUT_MINIMUM = 1000;
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
  private readonly fetchRequest: (
    request: Request,
    signal: AbortSignal,
    observeSignal: (signal: AbortSignal) => void,
  ) => Promise<Response>;
  private readonly signal?: AbortSignal;
  private connectionAbortController?: AbortController;
  private connectionReader?: ReadableStreamDefaultReader<Uint8Array>;
  private externalAbortSignal?: AbortSignal;
  private externalAbortHandler?: () => void;
  private internalRetryTime = FetchEventSource.RETRY_TIME_DEFAULT;
  private internalRetryMax?: number;
  private retryAttempt = 0;
  private connectionOrigin?: string;
  private reconnectTimeoutHandle?: ReturnType<typeof setTimeout>;
  private lastEventId?: string;
  private readonly logger?: Logger;
  private eventTimeout?: number;
  private readonly eventTimeoutConfigured: boolean;
  private readonly eventTimeoutCheckInterval: number;
  private eventTimeoutCheckHandle?: ReturnType<typeof setInterval>;
  private lastEventReceivedTime = 0;

  constructor(
    url: string,
    eventSourceInit?: EventSourceInit & {
      adapter?: (url: string, requestInit: RequestInit) => Promise<Request>;
      /** Executes one connection using a subscription-owned authentication recovery budget. */
      fetch?: (
        request: Request,
        signal: AbortSignal,
        observeSignal: (signal: AbortSignal) => void,
      ) => Promise<Response>;
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
    this.fetchRequest = eventSourceInit?.fetch ?? nativeFetch;
    this.signal = eventSourceInit?.signal;
    this.eventTimeout = eventSourceInit?.eventTimeout;
    this.eventTimeoutConfigured = eventSourceInit?.eventTimeout !== undefined;
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

    if (this.signal?.aborted) {
      this.logger?.trace?.('skipping connect with aborted signal');
      return;
    }

    this.startExternalAbortListener();
    this.internalConnect();
  }

  private internalConnect() {
    this.logger?.debug?.('connecting');

    if (this.signal?.aborted) return;
    this.readyState = this.CONNECTING;
    this.abortConnection();

    const connectionAbortController = new AbortController();
    this.connectionAbortController = connectionAbortController;

    const active = () =>
      this.connectionAbortController === connectionAbortController &&
      !connectionAbortController.signal.aborted;
    const parser = new EventParser(this.receiveControls);
    let signal = connectionAbortController.signal;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    void withAbort(
      () => {
        // Header construction can throw too; keep all setup inside this connection's error boundary.
        const headers = new Headers({
          accept: MediaType.EventStream.toString(),
        });
        if (this.lastEventId) {
          const bytes = new TextEncoder().encode(this.lastEventId);
          headers.set(
            FetchEventSource.LAST_EVENT_ID_HEADER,
            Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''),
          );
        }
        return this.adapter(this.url, {
          headers,
          cache: 'no-store',
          redirect: 'follow',
          signal,
        });
      },
      signal,
      discardBody,
    )
      .then(async (request) => {
        signal = AbortSignal.any([signal, request.signal]);
        request = copyRequest(request, { signal });
        const response = await withAbort(
          () =>
            this.fetchRequest(request, signal, (effective) => {
              signal = effective;
            }),
          signal,
          discardBody,
        );
        let validatedResponse: Response;
        try {
          validatedResponse = await withAbort(
            () => validate(response, true, undefined, this.logger),
            signal,
          );
        } catch (error) {
          const failure = requestFailure(error, signal);
          discardBody(response, failure);
          if (active()) this.receivedFatalError(failure);
          return;
        }
        if (!active()) {
          discardBody(validatedResponse, signal.reason);
          return;
        }
        this.receivedHeaders(validatedResponse);
        if (!active()) {
          discardBody(validatedResponse, signal.reason);
          return;
        }
        if (!validatedResponse.body) {
          this.receivedComplete();
          return;
        }
        reader = validatedResponse.body.getReader();
        this.connectionReader = reader;
        while (active()) {
          const result = await withAbort(() => reader!.read(), signal);
          if (!active()) return;
          if (result.done) break;
          this.logger?.debug?.('received data', {
            length: result.value.byteLength,
          });
          if (result.value.byteLength) this.updateLastEventReceived();
          parser.process(result.value, this.dispatchParsedEvent, signal);
        }
        if (active()) this.receivedComplete();
      })
      .catch((error: unknown) => {
        // A closed/replaced connection must never schedule a reconnect or close its successor.
        if (!active()) return;
        const failure = requestFailure(error, signal);
        if (
          signal.aborted ||
          isRequestStopped(failure) ||
          failure instanceof RequestValidationError ||
          (failure instanceof TokenProviderError &&
            failure.reason !== 'temporary') ||
          failure instanceof AuthorizationRequiredError
        ) {
          this.receivedFatalError(failure);
        } else {
          this.receivedError(failure);
        }
      })
      .finally(() => {
        reader?.releaseLock();
        if (this.connectionReader === reader) this.connectionReader = undefined;
      });
  }

  //
  // Close
  //

  /** Stops the subscription, forwarding an optional failure to the request and body producer. */
  close(reason: unknown = this.signal?.reason): void {
    if (this.readyState === this.CLOSED) {
      return;
    }

    this.logger?.debug?.('closing');

    this.readyState = this.CLOSED;

    this.stopExternalAbortListener();
    this.internalClose(reason);
  }

  private internalClose(reason?: unknown) {
    this.clearReconnect();
    this.stopEventTimeoutCheck();
    this.abortConnection(reason);
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
      Math.min(
        this.eventTimeoutCheckInterval,
        this.eventTimeout,
        FetchEventSource.MAX_TIMER_DELAY,
      ),
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
      this.receivedError(new Error('EventTimeout'));
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

      this.receivedError(new Error('InvalidState'));
      return;
    }

    this.logger?.info?.('opened');

    this.connectionOrigin = response.url;
    this.retryAttempt = 0;
    this.readyState = this.OPEN;

    if (!this.eventTimeoutConfigured) {
      this.eventTimeout = undefined;
    }

    // Start event timeout check, treating this connection
    // as the last time we received an event
    this.startEventTimeoutCheck(Date.now());

    const event = new Event('open');
    this.notify(event, this.onopen);
  }

  private receivedError(error: unknown) {
    if (this.readyState === this.CLOSED) {
      return;
    }

    this.logger?.debug?.('received error', { error });
    const connection = this.connectionAbortController;
    this.fireErrorEvent(error);
    this.scheduleReconnect(connection, error);
  }

  private receivedFatalError(error: unknown) {
    if (this.readyState === this.CLOSED) {
      return;
    }

    this.logger?.debug?.('received fatal error', { error });
    this.readyState = this.CLOSED;
    this.stopExternalAbortListener();
    this.internalClose(error);
    this.fireErrorEvent(error);
  }

  private receivedComplete() {
    if (this.readyState == this.CLOSED) {
      return;
    }

    this.logger?.debug?.('received complete');

    this.scheduleReconnect(this.connectionAbortController);
  }

  //
  // Reconnection
  //

  private scheduleReconnect(
    connection: AbortController | undefined,
    reason?: unknown,
  ) {
    // A notification can synchronously close, abort, or replace the connection.
    if (
      !connection ||
      connection !== this.connectionAbortController ||
      connection.signal.aborted ||
      this.signal?.aborted ||
      this.readyState === this.CLOSED
    )
      return;

    this.readyState = this.CONNECTING;
    this.internalClose(reason);
    // Cancellation handlers can also start a successor; never overwrite its state or timers.
    if (
      this.connectionAbortController ||
      this.readyState !== this.CONNECTING ||
      this.signal?.aborted
    )
      return;

    const retryDelay = FetchEventSource.calculateRetryTime(
      this.retryAttempt,
      this.retryTime,
      Math.max(
        this.retryTime,
        this.internalRetryMax ??
          this.retryTime * FetchEventSource.RETRY_MAX_MULTIPLIER_DEFAULT,
      ),
    );

    this.retryAttempt++;

    this.logger?.debug?.('scheduling reconnect', { retryDelay });

    const timer = setTimeout(() => {
      if (this.reconnectTimeoutHandle !== timer) return;
      this.reconnectTimeoutHandle = undefined;
      if (this.readyState === this.CONNECTING && !this.signal?.aborted)
        this.internalConnect();
    }, retryDelay);
    this.reconnectTimeoutHandle = timer;
  }

  private static calculateRetryTime(
    retryAttempt: number,
    retryTime: number,
    retryMax: number,
  ): number {
    if (retryAttempt === 0 || retryTime === 0) {
      return Math.min(retryTime, FetchEventSource.MAX_TIMER_DELAY);
    }

    const cappedDelay = Math.min(
      retryTime * Math.pow(2, retryAttempt),
      retryMax,
      FetchEventSource.MAX_TIMER_DELAY,
    );
    const randomValue =
      crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    return cappedDelay * (0.9 + randomValue * 0.1);
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

  private readonly receiveControls = (eventInfo: EventControl) => {
    if (eventInfo.retry !== undefined) {
      this.internalRetryTime = Number(eventInfo.retry);
      this.logger?.debug?.('updating retry timeout', {
        retryTime: this.internalRetryTime,
      });
    }

    if (eventInfo['retry-max'] != null) {
      const retryMax = parseEventMilliseconds(eventInfo['retry-max']);

      if (retryMax != null && retryMax > 0) {
        this.logger?.debug?.('updating maximum retry timeout', { retryMax });

        this.internalRetryMax = retryMax;
      } else {
        this.logger?.warn?.('ignoring invalid maximum retry timeout event', {
          eventInfo,
        });
      }
    }

    if (eventInfo.keepalive != null) {
      const keepalive = parseEventMilliseconds(eventInfo.keepalive);
      const keepaliveTimeout =
        keepalive == null || keepalive === 0
          ? undefined
          : Math.max(
              keepalive * FetchEventSource.KEEPALIVE_TIMEOUT_MULTIPLIER,
              FetchEventSource.KEEPALIVE_TIMEOUT_MINIMUM,
            );

      if (keepaliveTimeout != null && Number.isSafeInteger(keepaliveTimeout)) {
        this.logger?.debug?.('updating keepalive timeout', {
          keepalive,
          eventTimeout: keepaliveTimeout,
        });

        if (!this.eventTimeoutConfigured) {
          this.eventTimeout = keepaliveTimeout;
          this.startEventTimeoutCheck(this.lastEventReceivedTime);
        }
      } else {
        this.logger?.warn?.('ignoring invalid keepalive event', { eventInfo });
      }
    }
  };

  private readonly dispatchParsedEvent = (eventInfo: EventInfo) => {
    if (eventInfo.id !== undefined) this.lastEventId = eventInfo.id;

    // ID-only frames update the reconnect cursor without emitting application events.
    if (eventInfo.data == null) return;

    // Dispatch event
    const event = new MessageEvent(eventInfo.event || 'message', {
      data: eventInfo.data,
      lastEventId: this.lastEventId,
      origin: this.connectionOrigin,
    });

    this.notify(event, this.onmessage);
  };

  fireErrorEvent(error: unknown): void {
    const event = new Event('error');
    unknownSet(event, 'error', error);
    this.notify(event, this.onerror);
  }

  private notify<E extends Event>(
    event: E,
    handler: ((this: EventSource, event: E) => unknown) | null,
  ): void {
    if (!handler) {
      this.dispatchEvent(event);
      return;
    }
    // Properties receive named SSE messages too. Run them through native dispatch so observer
    // exceptions are reported by the runtime, never mistaken for a failed request or read.
    const listener = (received: Event) => {
      // A registered listener can synchronously dispatch another event of the same type.
      if (received !== event) return;
      return handler.call(this, event);
    };
    super.addEventListener(event.type, listener);
    try {
      this.dispatchEvent(event);
    } finally {
      // stopImmediatePropagation can prevent the property listener from running.
      super.removeEventListener(event.type, listener);
    }
  }

  private abortConnection(reason?: unknown) {
    const controller = this.connectionAbortController;
    const reader = this.connectionReader;
    this.connectionAbortController = undefined;
    this.connectionReader = undefined;
    controller?.abort(reason);
    if (reader) {
      void reader
        .cancel(reason)
        .catch((error: unknown) =>
          this.logger?.warn?.('failed to cancel connection reader', { error }),
        );
      try {
        reader.releaseLock();
      } catch {
        // A native reader may refuse lock release while cancellation is pending.
      }
    }
  }

  private startExternalAbortListener() {
    const externalSignal = this.signal;
    if (!(externalSignal instanceof AbortSignal)) {
      return;
    }

    this.stopExternalAbortListener();

    this.externalAbortSignal = externalSignal;
    this.externalAbortHandler = () => this.close();
    externalSignal.addEventListener('abort', this.externalAbortHandler, {
      once: true,
    });
  }

  private stopExternalAbortListener() {
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
