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

export namespace HeaderParameters {
  export function encode(
    parameters?: Record<string, unknown>
  ): [string, string][] {
    if (parameters == null) {
      return [];
    }

    const headers: [string, string][] = [];

    Object.entries(parameters).forEach(([name, parameter]) => {
      for (const value of encodeParam(name, parameter)) {
        headers.push([name, value]);
      }
    });

    return headers;
  }

  function encodeParam(name: string, value: unknown): string[] {
    if (value == null) {
      return [];
    }

    if (value instanceof Array) {
      const result: string[] = [];

      for (const item of value) {
        if (item == null) {
          continue;
        }

        result.push(validate(name, `${item}`));
      }

      return result;
    }

    return [validate(name, `${value}`)];
  }

  const asciiRegex = /^[\x20-\x7F]*$/;

  function validate(name: string, value: string): string {
    if (!asciiRegex.test(value)) {
      throw new Error(
        `The encoded header value contains one or more invalid characters: header=${name}, value=${value}`
      );
    }
    return value;
  }
}
