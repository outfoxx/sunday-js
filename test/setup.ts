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

import {expect} from 'bun:test';
import { Hex } from '../src';

const previewBuffer = (buffer: ArrayBuffer): string => {
  if (buffer.byteLength < 64) {
    return Hex.encode(buffer, ':');
  }
  return `${Hex.encode(buffer.slice(0, 60), ':')}...${
    buffer.byteLength - 60
  } more bytes`;
};

expect.extend({
  toHaveBytes(received: unknown, expected: unknown) {
    if (!(received instanceof ArrayBuffer)) {
      const type =
        received instanceof Object ? received.constructor.name : typeof received;
      return {
        pass: false,
        message: () => `Expected ArrayBuffer but actual value is ${type}`,
      };
    }
    if (!(expected instanceof ArrayBuffer)) {
      const type =
        expected instanceof Object ? expected.constructor.name : typeof expected;
      return {
        pass: false,
        message: () => `Expected ArrayBuffer but expected value is ${type}`,
      };
    }

    const actualBytes = Array.from(new Uint8Array(received));
    const expectedBytes = Array.from(new Uint8Array(expected));

    const pass =
      actualBytes.length === expectedBytes.length &&
      actualBytes.every((value, index) => value === expectedBytes[index]);

    if (pass) {
      return { pass: true, message: () => '' };
    }

    return {
      pass: false,
      message: () =>
        `Expected ArrayBuffer of bytes ${previewBuffer(expected)}\n` +
        `Actual ArrayBuffer bytes are  ${previewBuffer(received)}`,
    };
  },
});
