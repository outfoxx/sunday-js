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
import { RequestAdapter } from './request-adapter.js';
import { RequestAdapters, adaptRequest } from './request-adapters.js';
import { ResponseAdapter } from './response-adapter.js';
import { ResponseAdapters, adaptResponse } from './response-adapters.js';
import { requestFailure } from './request-cancellation-error.js';
import {
  authorizeRequest,
  AuthorizedRequest,
  canRecoverAuthentication,
  isBodylessRequest,
  rejectCredentials,
  redactSecurityResponse,
} from './request-security.js';
import { SecurityBinding } from './security-binding.js';
import { TokenProvider } from './token-provider.js';
import { discardBody, withAbort } from './util/abort.js';

/** @internal Shared configuration; receipts, cancellation, and retry state belong to each invocation. */
export class RequestExecution {
  private readonly requests: RequestAdapters;
  private readonly responses: ResponseAdapters;

  constructor(
    private readonly providers: Readonly<Record<string, TokenProvider>>,
    requestAdapter?: RequestAdapter,
    responseAdapter?: ResponseAdapter,
    private readonly maxBufferedRequestBytes?: number,
  ) {
    this.requests = new RequestAdapters(
      ...(requestAdapter ? [requestAdapter] : []),
    );
    this.responses = new ResponseAdapters(
      ...(responseAdapter ? [responseAdapter] : []),
    );
  }

  /** Materializes once; the consumer owns the resulting native request and its execution. */
  async export(
    request: Request,
    bindings: readonly SecurityBinding[],
  ): Promise<Request> {
    try {
      if (bindings.length)
        request = (
          await withAbort(
            () =>
              authorizeRequest(
                request,
                bindings,
                this.providers,
                this.maxBufferedRequestBytes,
              ),
            request.signal,
            (value, reason) => discardBody(value.request, reason),
          )
        ).request;
      return await this.requests.adapt(request);
    } catch (error) {
      discardBody(request, error);
      throw error;
    }
  }

  /** Executes one logical operation, including the caller's body consumption when provided. */
  async execute<T>(
    prepared: Request,
    bindings: readonly SecurityBinding[],
    budget: { recovered: boolean },
    consume: (response: Response, request: Request) => T | Promise<T>,
    observeSignal: (signal: AbortSignal) => void = () => {},
  ): Promise<T> {
    const controller = new AbortController();
    let signal = prepared.signal;
    observeSignal(signal);
    let sent = prepared;
    let response: Response | undefined;
    try {
      while (true) {
        signal.throwIfAborted();
        sent = copyRequest(prepared, { signal });
        let authorized: AuthorizedRequest | undefined;
        if (bindings.length) {
          const request = sent;
          authorized = await withAbort(
            () =>
              authorizeRequest(
                request,
                bindings,
                this.providers,
                this.maxBufferedRequestBytes,
              ),
            signal,
            (value, reason) => discardBody(value.request, reason),
          );
          sent = authorized.request;
        }
        sent = await adaptRequest(this.requests.adapters, sent, (effective) => {
          signal = effective;
          observeSignal(signal);
        });
        // Fetch does not expose intermediate redirect responses in browsers. Credentialed calls
        // must return the redirect instead of forwarding credentials beyond their selected origin.
        if (
          bindings.length ||
          sent.headers.has('Authorization') ||
          sent.headers.has('Cookie')
        ) {
          sent = copyRequest(sent, { redirect: 'manual', credentials: 'omit' });
        }
        const request = sent;
        response = await withAbort(
          // Keep cleanup cancellation separate from caller/adapter cancellation so an ordinary
          // network failure remains eligible for the event source's reconnect policy.
          () =>
            nativeFetch(
              request,
              AbortSignal.any([request.signal, controller.signal]),
            ),
          request.signal,
          discardBody,
        );
        if (authorized) {
          authorized = { ...authorized, request };
          const original = response;
          const receipts = authorized;
          await withAbort(
            () => rejectCredentials(receipts, original),
            request.signal,
          );
          response = redactSecurityResponse(response, bindings);
        }
        response = await adaptResponse(
          this.responses.adapters,
          response,
          request,
          true,
        );
        if (
          !budget.recovered &&
          isBodylessRequest(prepared) &&
          canRecoverAuthentication(request, response)
        ) {
          budget.recovered = true;
          discardBody(response);
          response = undefined;
          continue;
        }
        const accepted = response;
        return await withAbort(
          () => consume(accepted, request),
          request.signal,
        );
      }
    } catch (error) {
      const failure = requestFailure(error, signal);
      controller.abort(failure);
      if (response) discardBody(response, failure);
      discardBody(sent, failure);
      throw failure;
    }
  }
}
