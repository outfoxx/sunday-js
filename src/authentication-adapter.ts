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

import { RequestAdapters } from './request-adapters.js';
import { ResponseAdapters } from './response-adapters.js';
import type { RequestAdapter } from './request-adapter.js';
import type { ResponseAdapter } from './response-adapter.js';
import type { TokenProvider } from './token-provider.js';
import { TokenProviderError } from './token-provider.js';
import { RequestCancellationError } from './request-cancellation-error.js';
import { requestContext } from './request-context.js';
import { requestSecurityBindings } from './request-security-bindings.js';
import {
  authorizeRequest,
  rejectCredentials,
  redactSecurityResponse,
  type AuthorizedRequest,
} from './request-security.js';

/** Explicit provider integration. Transports know only the request and response adapter contracts. */
export class AuthenticationAdapter implements RequestAdapter, ResponseAdapter {
  private readonly receipt = Symbol('authenticationReceipt');

  /** Uses caller-owned providers and the explicit buffer bound when query credentials require a body copy. */
  constructor(
    private readonly providers: Readonly<Record<string, TokenProvider>>,
    private readonly options?: { maxBufferedRequestBytes?: number },
  ) {}

  adapt(request: Request): Promise<Request>;
  adapt(response: Response, request: Request): Promise<Response>;
  async adapt(
    value: Request | Response,
    request?: Request,
  ): Promise<Request | Response> {
    if (request) return this.adaptResponse(value as Response, request);
    const original = value as Request;
    const bindings = requestSecurityBindings(original);
    if (!bindings.length) return original;
    try {
      const authorized = await authorizeRequest(
        original,
        bindings,
        this.providers,
        this.options?.maxBufferedRequestBytes,
      );
      requestContext(authorized.request).set(this.receipt, authorized);
      return authorized.request;
    } catch (error) {
      if (error instanceof TokenProviderError && error.reason !== 'temporary')
        throw new RequestCancellationError(error.message, { cause: error });
      throw error;
    }
  }

  private async adaptResponse(
    response: Response,
    request: Request,
  ): Promise<Response> {
    if (!requestSecurityBindings(request).length) return response;
    const authorized = requestContext(request).get(this.receipt) as
      | AuthorizedRequest
      | undefined;
    if (!authorized) return response;
    try {
      await rejectCredentials({ ...authorized, request }, response);
    } catch (error) {
      if (error instanceof TokenProviderError && error.reason !== 'temporary')
        throw new RequestCancellationError(error.message, { cause: error });
      throw error;
    }
    return redactSecurityResponse(response, authorized.bindings);
  }
}

/** Compose provider integration explicitly, before optional application adapters. */
export function authenticationAdapters(
  providers: Readonly<Record<string, TokenProvider>>,
  requestAdapter?: RequestAdapter,
  responseAdapter?: ResponseAdapter,
  options?: ConstructorParameters<typeof AuthenticationAdapter>[1],
): { requestAdapter: RequestAdapter; responseAdapter: ResponseAdapter } {
  const authentication = new AuthenticationAdapter(providers, options);
  return {
    requestAdapter: new RequestAdapters(
      authentication,
      ...(requestAdapter ? [requestAdapter] : []),
    ),
    responseAdapter: new ResponseAdapters(
      authentication,
      ...(responseAdapter ? [responseAdapter] : []),
    ),
  };
}
