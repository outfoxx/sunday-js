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

import { Hex } from '../src';

describe('Hex', () => {
  it('encodes/decodes roundtrip', () => {
    const source = `AFC9E7835F33419AD46E669BB6D6`;
    const decoded = Hex.decode(source);
    const encoded = Hex.encode(decoded).toUpperCase();
    expect(encoded).toEqual(source);
  });

  it('decode does not accept invalid hex strings', () => {
    const source = `AFC9E7835F33419AD46E669BB6D66`;
    expect(() => Hex.decode(source)).toThrowError();
  });
});
