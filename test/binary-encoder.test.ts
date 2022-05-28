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

import { BinaryEncoder } from '../src';

describe('BinaryEncoder', () => {
  it('disallows encoding from non-binary types (e.g. String)', async () => {
    expect(() => new BinaryEncoder().encode('some text')).toThrow();
  });

  it('allows encoding from ArrayBuffer', async () => {
    expect(new BinaryEncoder().encode(new ArrayBuffer(10))).toBeInstanceOf(
      ArrayBuffer,
    );
  });

  it('allows encoding from typed arrays', async () => {
    expect(
      new BinaryEncoder().encode(new Uint16Array([1, 2, 3, 4, 5])),
    ).toBeInstanceOf(Uint16Array);
  });
});
