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

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DiscoveryMetadata, TokenErrorResponse, TokenSuccessResponse } from '../src/oauth-wire.js';

const corpus = JSON.parse(readFileSync(new URL('../test-fixtures/oauth/cases.json', import.meta.url), 'utf8')) as {
  formatVersion: number;
  cases: { id: string; kind: string; body: string; context: { scopes: string[]; clockMillis: number }; expected: string }[];
};

describe('OAuth wire conformance', () => {
  test('fixture format', () => expect(corpus.formatVersion).toBe(1));
  for (const item of corpus.cases) {
    test(item.id, async () => {
      const parse = async () => {
        if (item.kind === 'discovery') return DiscoveryMetadata.parse(item.body);
        if (item.kind === 'error') return TokenErrorResponse.parse(item.body);
        return (await TokenSuccessResponse.parse(item.body)).tokens(item.context.scopes, item.context.clockMillis);
      };
      if (item.expected === 'accept') await expect(parse()).resolves.toBeDefined();
      else await expect(parse()).rejects.toThrow();
    });
  }
});
