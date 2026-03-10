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

import { describe, it, expect, setSystemTime } from 'bun:test';
import {
  RefreshingHeaderTokenAuthorizingAdapter,
  RequestFactory,
  StaticHeaderTokenAuthorizingAdapter,
} from '../src';

describe('Request Adapters', () => {
  describe('RefreshingHeaderTokenAuthorizingAdapter', () => {
    it('should cache token', async () => {
      const start = new Date('2026-01-01T00:00:00.000Z');
      setSystemTime(start);
      try {
        let tokenId = 0;
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

        expect(adapter.shouldRefresh()).toBe(true);

        const expectedRequest = new Request('https://example.com');
        expectedRequest.headers.set('Authorization', 'Bearer token-1');
        const adaptedRequest = await adapter.adapt(requestFactory, request);
        expect(adaptedRequest).toEqual(expectedRequest);

        expect(adapter.shouldRefresh()).toBe(false);

        setSystemTime(new Date(start.getTime() + 499));
        expect(adapter.shouldRefresh()).toBe(false);

        setSystemTime(new Date(start.getTime() + 500));
        expect(adapter.shouldRefresh()).toBe(true);

        const expectedRequest2 = new Request('https://example.com');
        expectedRequest2.headers.set('Authorization', 'Bearer token-2');
        const adaptedRequest2 = await adapter.adapt(requestFactory, request);
        expect(adaptedRequest2).toEqual(expectedRequest2);

        expect(adapter.shouldRefresh()).toBe(false);
      }
      finally {
        setSystemTime();
      }
    });
  });

  describe('StaticHeaderTokenAuthorizingAdapter', () => {
    it('should apply token', async () => {
      const request = new Request('https://example.com');
      const requestFactory = {} as RequestFactory;
      const adapter = new StaticHeaderTokenAuthorizingAdapter('token-1');

      const expectedRequest = new Request('https://example.com');
      expectedRequest.headers.set('Authorization', 'Bearer token-1');
      const adaptedRequest = await adapter.adapt(requestFactory, request);
      expect(adaptedRequest).toEqual(expectedRequest);
    });
  });
});
