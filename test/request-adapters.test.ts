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

import {
  RefreshingHeaderTokenAuthorizingAdapter,
  RequestFactory,
  StaticHeaderTokenAuthorizingAdapter,
} from '../src';

describe('Request Adapters', () => {
  describe('RefreshingHeaderTokenAuthorizingAdapter', () => {
    it('should cache token', async () => {
      let tokenId = 1;
      const refresher = async () => {
        tokenId++;
        return {
          token: `token-${tokenId}`,
          expires: new Date(Date.now() + 500),
        };
      };

      const request = new Request('https://example.com');
      const requestFactory = {} as RequestFactory;
      const adapter = new RefreshingHeaderTokenAuthorizingAdapter(refresher);

      expect(adapter.shouldRefresh()).toBeTrue();

      const expectedRequest = new Request('https://example.com');
      expectedRequest.headers.set('Authorization', 'Bearer token-1');
      await expectAsync(adapter.adapt(requestFactory, request)).toBeResolvedTo(
        expectedRequest,
      );

      expect(adapter.shouldRefresh()).toBeFalse();

      await delay(500);

      expect(adapter.shouldRefresh()).toBeTrue();

      const expectedRequest2 = new Request('https://example.com');
      expectedRequest2.headers.set('Authorization', 'Bearer token-2');
      await expectAsync(adapter.adapt(requestFactory, request)).toBeResolvedTo(
        expectedRequest2,
      );

      expect(adapter.shouldRefresh()).toBeFalse();
    });
  });

  describe('StaticHeaderTokenAuthorizingAdapter', () => {
    it('should apply token', async () => {
      const request = new Request('https://example.com');
      const requestFactory = {} as RequestFactory;
      const adapter = new StaticHeaderTokenAuthorizingAdapter('token-1');

      const expectedRequest = new Request('https://example.com');
      expectedRequest.headers.set('Authorization', 'Bearer token-1');
      await expectAsync(adapter.adapt(requestFactory, request)).toBeResolvedTo(
        expectedRequest,
      );
    });
  });
});

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
