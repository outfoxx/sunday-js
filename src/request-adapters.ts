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

import { RequestAdapter, RequestFactory } from './request-factory';

export abstract class HeaderTokenAuthorizingAdapter implements RequestAdapter {
  header: string = 'Authorization';
  tokenHeaderType: string = 'Bearer';

  applyToken(request: Request, accessToken: string): Request {
    const requestClone = request.clone();
    requestClone.headers.set(
      this.header,
      `${this.tokenHeaderType} ${accessToken}`,
    );
    return requestClone;
  }

  abstract adapt(
    requestFactory: RequestFactory,
    request: Request,
  ): Promise<Request>;
}

export class StaticHeaderTokenAuthorizingAdapter extends HeaderTokenAuthorizingAdapter {
  constructor(private readonly accessToken: string) {
    super();
  }

  async adapt(
    requestFactory: RequestFactory,
    request: Request,
  ): Promise<Request> {
    return this.applyToken(request, this.accessToken);
  }
}

export interface TokenAuthorization {
  token: string;
  expires: Date;
}

export class RefreshingHeaderTokenAuthorizingAdapter extends HeaderTokenAuthorizingAdapter {
  private authorization?: TokenAuthorization;

  constructor(
    private readonly refresh: (
      requestFactory: RequestFactory,
    ) => Promise<TokenAuthorization>,
  ) {
    super();
  }

  shouldRefresh(): boolean {
    if (!this.authorization) {
      return true;
    }
    return this.authorization.expires.getTime() <= Date.now();
  }

  async adapt(
    requestFactory: RequestFactory,
    request: Request,
  ): Promise<Request> {
    if (!this.authorization || this.shouldRefresh()) {
      this.authorization = await this.refresh(requestFactory);
    }
    return this.applyToken(request, this.authorization.token);
  }
}
