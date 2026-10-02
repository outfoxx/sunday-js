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
import { Buffer } from 'node:buffer';
import { decodeBase64, encodeBase64 } from '../src/util/base64';

const alphabets: ('base64' | 'base64url')[] = ['base64', 'base64url'];

describe('portable base64', () => {
  it.each(alphabets)('preserves padding, whitespace, and loose final chunks for %s', (alphabet) => {
    for (const [encoded, expected, canonical] of [
      ['', '', ''], [' \t\r\n\f', '', ''], ['Zg', 'f', 'Zg'], ['Zg==', 'f', 'Zg'], ['Zh==', 'f', 'Zg'],
      ['Zm8', 'fo', 'Zm8'], ['Zm8=', 'fo', 'Zm8'], ['Zm9v', 'foo', 'Zm9v'], [' Z m\n8=\t', 'fo', 'Zm8'],
    ]) {
      expect(new TextDecoder().decode(decodeBase64(encoded, alphabet))).toBe(expected);
      expect(encodeBase64(new TextEncoder().encode(expected), alphabet)).toBe(canonical);
    }
  });

  it.each(alphabets)('rejects malformed %s input', (alphabet) => {
    for (const value of ['A', 'Zg=', '=Zg=', 'Zg===', 'Zg==A', 'Z!g', 'Zg\u00a0', 'Zg\v']) {
      expect(() => decodeBase64(value, alphabet)).toThrow(SyntaxError);
    }
  });

  it('keeps standard and URL-safe alphabets distinct', () => {
    const bytes = Uint8Array.of(0, 127, 128, 254, 255);
    expect(encodeBase64(bytes)).toBe('AH+A/v8');
    expect(encodeBase64(bytes, 'base64url')).toBe('AH-A_v8');
    expect(new Uint8Array(decodeBase64('AH+A/v8='))).toEqual(bytes);
    expect(new Uint8Array(decodeBase64('AH-A_v8=', 'base64url'))).toEqual(bytes);
    expect(() => decodeBase64('AH-A_v8', 'base64')).toThrow(SyntaxError);
    expect(() => decodeBase64('AH+A/v8', 'base64url')).toThrow(SyntaxError);
  });

  it.each(alphabets)('round trips large byte views without exposing surrounding bytes for %s', (alphabet) => {
    for (const length of [24575, 24576, 24577, 24578, 49153, 200001]) {
      const storage = Uint8Array.from({ length: length + 2 }, (_, index) => index % 256);
      const bytes = storage.subarray(1, storage.length - 1);
      const expected = Buffer.from(bytes).toString(alphabet).replace(/=+$/, '');
      const encoded = encodeBase64(bytes, alphabet);
      expect(encoded).toBe(expected);
      const decoded = decodeBase64(encoded, alphabet);
      expect(decoded.byteLength).toBe(bytes.length);
      expect(new Uint8Array(decoded)).toEqual(bytes);
    }
  });
});
