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

import {beforeEach, describe, it, expect} from 'bun:test';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import {
  ArrayBufferSchema,
  BinaryDecoder,
  SchemaLike,
  StringSchema,
} from '../src';

const arrayBufferSchema: SchemaLike<ArrayBuffer> = ArrayBufferSchema;
const stringSchema: SchemaLike<string> = StringSchema;

const viewSchema = <T>(ctor: (buffer: ArrayBuffer) => T): SchemaLike<T> =>
  z.codec(z.unknown(), z.unknown() as z.ZodType<T>, {
    encode: () => {
      throw new Error('Serialize not supported');
    },
    decode: (value) => {
      if (!(value instanceof ArrayBuffer)) {
        throw new Error('Invalid binary');
      }
      return ctor(value);
    },
  });

describe('BinaryDecoder', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('disallows decoding to non-binary types (e.g. String)', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), stringSchema),
    ).rejects.toThrow();
  });

  it('allows decoding to ArrayBuffer', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        arrayBufferSchema,
      ),
    ).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('allows decoding to Int8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSchema((buffer) => new Int8Array(buffer)),
      ),
    ).resolves.toBeInstanceOf(Int8Array);
  });

  it('allows decoding to Uint8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSchema((buffer) => new Uint8Array(buffer)),
      ),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('allows decoding to DataView', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSchema((buffer) => new DataView(buffer)),
      ),
    ).resolves.toBeInstanceOf(DataView);
  });
});
