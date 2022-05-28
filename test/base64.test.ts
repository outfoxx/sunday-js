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

import { Base64 } from '../src';

describe('Base64', () => {
  it('decodes with new lines', () => {
    const decoded = Base64.decode(
      `MDEyMzQ1Njc4OT\n AxMjM0NTY3O\nDkwMTIzNDU2Nzg5MD\n  EyMzQ1Njc4OT\nAxMjM0NTY3ODkwMTIzNDU2Nzg5MD\nEyMzQ1Njc4OTAxMjM0NTY3ODk=`,
    );
    // prettier-ignore
    expect(Array.from(new Uint8Array(decoded)))
      .toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ].map(value => value + 48));
  });

  it('encodes/decodes roundtrip', () => {
    const source = `MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODk=`;
    const decoded = Base64.decode(source);
    const encoded = Base64.encode(decoded);
    expect(encoded).toEqual(source);
  });
});
