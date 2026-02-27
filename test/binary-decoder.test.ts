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
import { arrayBufferSerde, BinaryDecoder, Serde, stringSerde } from '../src';

const viewSerde = <T>(ctor: (buffer: ArrayBuffer) => T): Serde<T> => ({
  serialize: () => {
    throw new Error('Serialize not supported');
  },
  deserialize: (value) => {
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
      new BinaryDecoder().decode(await fetch('http://example.com'), stringSerde),
    ).rejects.toThrow();
  });

  it('allows decoding to ArrayBuffer', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        arrayBufferSerde,
      ),
    ).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('allows decoding to Int8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSerde((buffer) => new Int8Array(buffer)),
      ),
    ).resolves.toBeInstanceOf(Int8Array);
  });

  it('allows decoding to Uint8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSerde((buffer) => new Uint8Array(buffer)),
      ),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('allows decoding to DataView', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    expect(
      new BinaryDecoder().decode(
        await fetch('http://example.com'),
        viewSerde((buffer) => new DataView(buffer)),
      ),
    ).resolves.toBeInstanceOf(DataView);
  });
});
