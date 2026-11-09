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

import { bodyReads } from './util/owned-body.js';
import { TokenManager, TokenLease } from './token-manager.js';
import { TokenProviderError, TokenSet } from './token-provider.js';
import { RequestAdapter } from './request-adapter.js';
import { ResponseAdapter } from './response-adapter.js';
import { copyRequest } from './fetch-copy.js';
import { hasInvalidBearerChallenge } from './request-security.js';
import { withAbort, discardBody } from './util/abort.js';

export abstract class HeaderTokenAuthorizingAdapter implements RequestAdapter {
  header = 'Authorization';
  tokenHeaderType = 'Bearer';

  applyToken(request: Request, accessToken: string): Request {
    const headers = new Headers(request.headers);
    headers.set(this.header, `${this.tokenHeaderType} ${accessToken}`);
    return copyRequest(request, { headers });
  }

  abstract adapt(request: Request): Promise<Request>;
}

export class StaticHeaderTokenAuthorizingAdapter extends HeaderTokenAuthorizingAdapter {
  constructor(private readonly accessToken: string) {
    super();
  }

  async adapt(request: Request): Promise<Request> {
    return this.applyToken(request, this.accessToken);
  }
}

export interface TokenAuthorization {
  token: string;
  expires: Date;
}

/** Optional caching authorization adapter; install its response capability explicitly for feedback. */
export class RefreshingHeaderTokenAuthorizingAdapter
  extends HeaderTokenAuthorizingAdapter
  implements ResponseAdapter
{
  private readonly manager: TokenManager;
  private tokens?: TokenSet;
  private lease?: TokenLease;

  constructor(refresh: (signal: AbortSignal) => Promise<TokenAuthorization>) {
    super();
    this.manager = new TokenManager(
      {
        identity: 'header-token-adapter',
        configure: () => ({ clientIdentity: 'header-token-adapter' }),
        acquire: async (_request, signal) => {
          try {
            const authorization = await refresh(signal);
            return {
              accessToken: authorization.token,
              expiresAt: authorization.expires.getTime(),
            };
          } catch (error) {
            throw new RefreshFailure(error);
          }
        },
      },
      {
        expirySkewMs: 0,
        // One store slot, owned exclusively by this manager; no parallel adapter cache.
        store: {
          load: async () => this.tokens,
          save: async (_key, tokens) => {
            this.tokens = tokens;
          },
          remove: async () => {
            this.tokens = undefined;
          },
        },
      },
    );
  }

  /** Reports the manager's current expiry state without starting a refresh. */
  shouldRefresh(): boolean {
    return !this.tokens || this.tokens.expiresAt! <= Date.now();
  }

  adapt(request: Request): Promise<Request>;
  adapt(response: Response, request: Request): Promise<Response>;
  async adapt(
    value: Request | Response,
    request?: Request,
  ): Promise<Request | Response> {
    if (request) {
      const response = value as Response;
      const lease = this.lease;
      if (
        lease &&
        response.status === 401 &&
        hasInvalidBearerChallenge(
          response.headers.get('WWW-Authenticate') ?? '',
        ) &&
        request.headers.get(this.header) ===
          `${this.tokenHeaderType} ${lease.tokens.accessToken}`
      ) {
        await lease.invalidate?.();
      }
      return response;
    }
    request = value as Request;
    try {
      const lease = await this.manager.credentials(
        {
          scheme: 'header-token',
          provider: 'header-token',
          flow: 'external',
          scopes: [],
          transport: {
            location: 'header',
            name: this.header,
            prefix: this.tokenHeaderType,
          },
        },
        request.signal,
      );
      request.signal.throwIfAborted();
      this.lease = lease;
      return this.applyToken(request, lease.tokens.accessToken);
    } catch (error) {
      if (error instanceof RefreshFailure) throw error.cause;
      throw error;
    }
  }
}

// TokenManager sanitizes provider errors; this adapter retains its application-error contract.
class RefreshFailure extends TokenProviderError {
  constructor(cause: unknown) {
    super();
    this.cause = cause;
  }
}

/** Flat, ordered composition; adapters may be ordinary objects with an adapt method. */
export class RequestAdapters implements RequestAdapter {
  readonly adapters: readonly RequestAdapter[];

  constructor(...adapters: readonly RequestAdapter[]) {
    this.adapters = Object.freeze(
      adapters.flatMap((adapter) =>
        adapter instanceof RequestAdapters ? adapter.adapters : [adapter],
      ),
    );
  }

  /** Appends adapters without nesting execution pipelines. */
  chainTo(...next: readonly RequestAdapter[]): RequestAdapters {
    return new RequestAdapters(this, ...next);
  }

  async adapt(request: Request): Promise<Request> {
    return adaptRequest(this.adapters, request);
  }
}

/** @internal Reports the effective signal while keeping invocation state out of the shared chain. */
export async function adaptRequest(
  adapters: readonly RequestAdapter[],
  request: Request,
  observeSignal: (signal: AbortSignal) => void = () => {},
): Promise<Request> {
  let signal = request.signal;
  try {
    bodyReads(request);
    for (const adapter of adapters) {
      request = await withAbort(
        () => adapter.adapt(request),
        signal,
        discardBody,
      );
      if (request.signal !== signal)
        request = copyRequest(request, {
          signal: AbortSignal.any([signal, request.signal]),
        });
      bodyReads(request);
      signal = request.signal;
      observeSignal(signal);
      signal.throwIfAborted();
    }
    signal.throwIfAborted();
    return request;
  } catch (error) {
    discardBody(request, error);
    throw error;
  }
}

/** Composes plain object adapters without requiring inheritance or modifying native prototypes. */
export function chainRequestAdapters(
  ...adapters: readonly RequestAdapter[]
): RequestAdapters {
  return new RequestAdapters(...adapters);
}
