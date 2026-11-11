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

import { AuthenticationAdapter } from './authentication-adapter.js';
import { BearerTokenRejectionAdapter } from './bearer-token-rejection-adapter.js';
import { isRequestStopped } from './request-cancellation-error.js';
import type { ClientSettings } from './client-settings.js';
import { FetchTransport } from './fetch-transport.js';
import type { RequestAdapter } from './request-adapter.js';
import { RequestAdapters } from './request-adapters.js';
import type { ResponseAdapter } from './response-adapter.js';
import { ResponseAdapters } from './response-adapters.js';
import { requestSecurityBindings } from './request-security-bindings.js';
import type { TokenProvider } from './token-provider.js';

/** Opt-in attachment, rejection feedback, and terminal cancellation. Supplied providers are never cached or wrapped. */
export class StandardAuthenticationAdapter
  implements RequestAdapter, ResponseAdapter
{
  private readonly authentication: AuthenticationAdapter;
  private readonly responses: ResponseAdapters;

  /** Uses caller-owned providers; supply TokenManager explicitly for Sunday-managed caching and refresh. */
  constructor(providers: Readonly<Record<string, TokenProvider>>) {
    this.authentication = new AuthenticationAdapter(providers);
    this.responses = new ResponseAdapters(
      this.authentication,
      new BearerTokenRejectionAdapter(),
    );
  }

  /** Attaches selected credentials, or reports rejection before cancellation; never replays. */
  adapt(request: Request): Promise<Request>;
  adapt(response: Response, request: Request): Promise<Response>;
  async adapt(
    value: Request | Response,
    request?: Request,
  ): Promise<Request | Response> {
    if (!request) return this.authentication.adapt(value as Request);
    if (!requestSecurityBindings(request).length) return value;
    try {
      return await this.responses.adapt(value as Response, request);
    } catch (error) {
      if (request.signal.aborted || isRequestStopped(error)) throw error;
      // Feedback failure must not bypass the explicitly selected stop policy.
      await new BearerTokenRejectionAdapter().adapt(value as Response, request);
      throw error;
    }
  }
}

/** Explicit standard factory for generated clients. Additional adapters run after standard authentication. */
export function standardTransportFromSettings(
  settings: ClientSettings,
  options?: ConstructorParameters<typeof FetchTransport>[1],
): FetchTransport {
  const authentication = new StandardAuthenticationAdapter(
    settings.tokenProviders,
  );
  const request = options?.requestAdapter ?? options?.adapter;
  const response = options?.responseAdapter;
  return new FetchTransport(settings.baseUrl, {
    ...options,
    requestAdapter: new RequestAdapters(
      authentication,
      ...(request ? [request] : []),
    ),
    responseAdapter: new ResponseAdapters(
      authentication,
      ...(response ? [response] : []),
    ),
  });
}
