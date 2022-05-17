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

export namespace Hex {
  export function decode(hex: string): ArrayBuffer {
    hex = hex.replace(/^0x/, '').replace(/\s/g, '');
    const values = hex.match(/[\da-f]{2}/gi);
    if (!values || values.length != hex.length / 2) {
      throw Error(`Invalid hex string`);
    }
    return new Uint8Array(values.map((b) => parseInt(b, 16))).buffer;
  }

  export function encode(buffer: ArrayBuffer, separator = ''): string {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join(separator);
  }
}
