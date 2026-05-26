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

import { describe, expect, it } from 'bun:test';
import { ResponseHeaders } from '../src/operation-response';

interface HeadersWithSetCookie extends Headers {
  getSetCookie: () => string[];
}

describe('ResponseHeaders', () => {
  it('splits comma-separated list response headers', () => {
    const headers = new Headers();
    headers.append('vary', 'accept');
    headers.append('vary', 'origin');

    const responseHeaders = ResponseHeaders.from(headers);

    expect(responseHeaders.getAll('Vary')).toEqual(['accept', 'origin']);
  });

  it('does not split comma-separated non-list response headers', () => {
    const headers = new Headers();
    headers.set('date', 'Tue, 15 Nov 1994 08:12:31 GMT');

    const responseHeaders = ResponseHeaders.from(headers);

    expect(responseHeaders.getAll('date')).toEqual(['Tue, 15 Nov 1994 08:12:31 GMT']);
  });

  it('does not split link header commas inside URLs or quotes', () => {
    const headers = new Headers();
    headers.set(
      'link',
      '<https://example.com/a,b>; rel="next"; title="A, B", <https://example.com/c>; rel="last"',
    );

    const responseHeaders = ResponseHeaders.from(headers);

    expect(responseHeaders.getAll('link')).toEqual([
      '<https://example.com/a,b>; rel="next"; title="A, B"',
      '<https://example.com/c>; rel="last"',
    ]);
  });

  it('uses getSetCookie when the runtime exposes raw set-cookie headers', () => {
    const headers = new Headers() as HeadersWithSetCookie;
    headers.append('set-cookie', 'a=1; Path=/');
    headers.append('set-cookie', 'b=2; Path=/');
    headers.getSetCookie = () => ['a=1; Path=/', 'b=2; Path=/'];

    const responseHeaders = ResponseHeaders.from(headers);

    expect(responseHeaders.getAll('set-cookie')).toEqual(['a=1; Path=/', 'b=2; Path=/']);
  });
});
