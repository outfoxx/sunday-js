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
    parameters?: Record<string, unknown>,
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

    if (Array.isArray(value)) {
      const result: string[] = [];

      for (const item of value) {
        if (item == null) {
          continue;
        }

        result.push(validate(name, `${item}`));
      }

      return result;
    }

    const string = convertToString(value);
    if (string == null) {
      return [];
    }

    return [validate(name, string)];
  }

  function convertToString(value: unknown): string | undefined {
    if (value == null) {
      return undefined;
    } else if (typeof value === 'string') {
      return value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      typeof value === 'boolean'
    ) {
      return `${value}`;
    } else if (typeof value === 'symbol' || value instanceof URL) {
      return value.toString();
    } else if (value instanceof Date) {
      return value.toISOString();
    } else if (typeof value === 'object') {
      return JSON.stringify(value);
    } else {
      throw new TypeError(`Unsupported header parameter type: ${typeof value}`);
    }
  }

  const asciiRegex = /^[\x20-\x7F]*$/;

  function validate(name: string, value: string): string {
    if (!asciiRegex.test(value)) {
      throw new Error(
        `The encoded header value contains one or more invalid characters: header=${name}, value=${value}`,
      );
    }
    return value;
  }
}
