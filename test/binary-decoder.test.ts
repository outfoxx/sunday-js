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

import fetchMock from 'fetch-mock';
import { BinaryDecoder } from '../src';
import any = jasmine.any;

describe('BinaryDecoder', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('disallows decoding to non-binary types (e.g. String)', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    await expectAsync(
      new BinaryDecoder().decode(await fetch('http://example.com'), [String])
    ).toBeRejected();
  });

  it('allows decoding to ArrayBuffer', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    await expectAsync(
      new BinaryDecoder().decode(await fetch('http://example.com'), [
        ArrayBuffer,
      ])
    ).toBeResolvedTo(any(ArrayBuffer));
  });

  it('allows decoding to Int8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    await expectAsync(
      new BinaryDecoder().decode(await fetch('http://example.com'), [Int8Array])
    ).toBeResolvedTo(any(Int8Array));
  });

  it('allows decoding to Uint8Array', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    await expectAsync(
      new BinaryDecoder().decode(await fetch('http://example.com'), [
        Uint8Array,
      ])
    ).toBeResolvedTo(any(Uint8Array));
  });

  it('allows decoding to DataView', async () => {
    fetchMock.getOnce('http://example.com', 'some data');
    await expectAsync(
      new BinaryDecoder().decode(await fetch('http://example.com'), [DataView])
    ).toBeResolvedTo(any(DataView));
  });
});
