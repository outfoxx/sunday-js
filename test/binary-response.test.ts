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

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import { ArrayBufferSchema, createOperation, defineSchema, FetchTransport, MediaType, Problem } from '../src';

const binaryUnion = defineSchema(runtime => z.union([
  runtime.resolveSchema(ArrayBufferSchema), runtime.resolveSchema(ArrayBufferSchema),
]));

describe('binary responses', () => {
  beforeEach(() => { fetchMock.hardReset().mockGlobal(); });
  afterEach(() => { fetchMock.hardReset(); });

  for (const responseType of [ArrayBufferSchema, binaryUnion]) {
    for (const media of ['application/json', 'text/plain; charset=iso-8859-1', 'image/png', 'application/x-download']) {
      for (const bytes of [new Uint8Array([0, 255, 34, 128]), new Uint8Array()]) {
        it(`preserves ${bytes.length} bytes of ${media}`, async () => {
          fetchMock.get('https://example.com/download', () => new Response(bytes, { headers: { 'content-type': media } }));
          const operation = createOperation(new FetchTransport('https://example.com'), {
            request: { method: 'GET', pathTemplate: '/download', acceptTypes: [MediaType.from('*/*')], binaryResponse: true },
            responseType,
          });
          expect(new Uint8Array(await operation.execute())).toEqual(bytes);
          expect(new Uint8Array((await operation.response()).result)).toEqual(bytes);
        });
      }
    }
  }

  it('keeps mixed union media decoding', async () => {
    fetchMock.get('https://example.com/download', { body: '"asset"', headers: { 'content-type': 'application/json' } });
    const mixed = defineSchema(runtime => z.union([z.string(), runtime.resolveSchema(ArrayBufferSchema)]));
    const result = await new FetchTransport('https://example.com').result({ method: 'GET', pathTemplate: '/download' }, mixed);
    expect(result).toBe('asset');
  });

  it('preserves problem handling for binary operations', async () => {
    fetchMock.get('https://example.com/download', { status: 404, body: { title: 'Missing', status: 404 }, headers: { 'content-type': 'application/problem+json' } });
    await expect(new FetchTransport('https://example.com').result({ method: 'GET', pathTemplate: '/download', binaryResponse: true }, ArrayBufferSchema)).rejects.toBeInstanceOf(Problem);
  });
});
