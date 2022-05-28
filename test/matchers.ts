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

import CustomMatcher = jasmine.CustomMatcher;
import CustomMatcherResult = jasmine.CustomMatcherResult;
import MatchersUtil = jasmine.MatchersUtil;
import { Hex } from '../src/util/hex';

beforeAll(() => {
  jasmine.addCustomEqualityTester(
    (a: URL | unknown, b: URL | unknown): boolean | void => {
      if (!(a instanceof URL) || !(b instanceof URL)) {
        return;
      }
      return a.toJSON() === b.toJSON();
    },
  );

  jasmine.addCustomEqualityTester(
    (a: ArrayBuffer | unknown, b: ArrayBuffer | unknown): boolean | void => {
      if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer)) {
        return;
      }
      const actualBytes = Array.from(new Uint8Array(a));
      const expectedBytes = Array.from(new Uint8Array(b));
      return (
        actualBytes.length === expectedBytes.length &&
        actualBytes.every((value, index) => value === expectedBytes[index])
      );
    },
  );

  jasmine.addMatchers({
    toHaveBytes(util: MatchersUtil): CustomMatcher {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        compare(actual: any, expected: any): CustomMatcherResult {
          if (!(actual instanceof ArrayBuffer)) {
            const type =
              actual instanceof Object
                ? actual.constructor.name
                : typeof actual;
            return {
              pass: false,
              message: `Expected ArrayBuffer but actual value is ${type}`,
            };
          }
          const actualBytes = Array.from(new Uint8Array(actual));
          const expectedBytes = Array.from(new Uint8Array(expected));
          if (util.equals(actualBytes, expectedBytes)) {
            return { pass: true };
          }
          return {
            pass: false,
            message:
              `Expected ArrayBuffer of bytes ${previewBuffer(expected)}\n` +
              `Actual ArrayBuffer bytes are  ${previewBuffer(actual)}`,
          };
        },
      };
    },
  });
});

function previewBuffer(buffer: ArrayBuffer): string {
  if (buffer.byteLength < 64) {
    return Hex.encode(buffer, ':');
  }
  return `${Hex.encode(buffer.slice(0, 60), ':')}...${
    buffer.byteLength - 60
  } more bytes`;
}
