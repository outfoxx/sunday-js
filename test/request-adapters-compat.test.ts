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

import { expect, it } from 'bun:test';
import {
  HeaderTokenAuthorizingAdapter,
  StaticHeaderTokenAuthorizingAdapter,
  RefreshingHeaderTokenAuthorizingAdapter,
  RequestAdapters,
  type TokenAuthorization,
} from '../src/request-adapters-compat';
import * as root from '../src';

it('retains header adapter and chain exports at the compatibility boundary', async () => {
  expect(HeaderTokenAuthorizingAdapter).toBe(
    root.HeaderTokenAuthorizingAdapter,
  );
  expect(RefreshingHeaderTokenAuthorizingAdapter).toBe(
    root.RefreshingHeaderTokenAuthorizingAdapter,
  );
  expect(RequestAdapters).toBe(root.RequestAdapters);
  const token: TokenAuthorization = { token: 'access', expires: new Date() };
  const request = await new StaticHeaderTokenAuthorizingAdapter(
    token.token,
  ).adapt(new Request('https://example.test'));
  expect(request.headers.get('Authorization')).toBe('Bearer access');
});
