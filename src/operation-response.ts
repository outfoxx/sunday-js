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

import { MediaType } from './media-type.js';

const commaSeparatedResponseHeaders = new Set([
  'accept-ranges',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-expose-headers',
  'allow',
  'cache-control',
  'connection',
  'content-encoding',
  'link',
  'transfer-encoding',
  'upgrade',
  'vary',
]);

/** A single HTTP response header entry. */
export interface ResponseHeaderEntry {
  readonly name: string;
  readonly value: string;
}

/** HTTP response headers with case-insensitive lookup. */
export class ResponseHeaders {
  readonly entries: readonly ResponseHeaderEntry[];

  constructor(entries: readonly ResponseHeaderEntry[]) {
    this.entries = entries;
  }

  /** Creates response headers from a Fetch API `Headers` value. */
  static from(headers: Headers): ResponseHeaders {
    const entries: ResponseHeaderEntry[] = [];
    const setCookies = headers.getSetCookie?.() ?? [];

    headers.forEach((value, name) => {
      if (name.toLowerCase() === 'set-cookie' && setCookies.length > 0) {
        return;
      }

      splitHeaderValue(name, value).forEach((value) => {
        entries.push({ name, value });
      });
    });

    setCookies.forEach((value) => {
      entries.push({ name: 'set-cookie', value });
    });

    return new ResponseHeaders(entries);
  }

  /** Retrieves all values matching `name` case-insensitively. */
  getAll(name: string): readonly string[] {
    return this.entries
      .filter((entry) => entry.name.toLowerCase() === name.toLowerCase())
      .map((entry) => entry.value);
  }

  /** Retrieves the first value matching `name` case-insensitively. */
  get(name: string): string | undefined {
    return this.entries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.value;
  }

  /** Parsed `Content-Type` header value. */
  get contentType(): MediaType | undefined {
    const value = this.get('content-type');
    if (!value) {
      return undefined;
    }
    try {
      return MediaType.from(value);
    }
    catch {
      return undefined;
    }
  }
}

function splitHeaderValue(name: string, value: string): readonly string[] {
  if (!commaSeparatedResponseHeaders.has(name.toLowerCase())) {
    return [value];
  }

  const values: string[] = [];
  let start = 0;
  let inQuotes = false;
  let inAngleBrackets = false;
  let escaping = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\' && inQuotes) {
      escaping = true;
      continue;
    }

    if (char === '"' && !inAngleBrackets) {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === '<' && !inQuotes) {
      inAngleBrackets = true;
      continue;
    }

    if (char === '>' && !inQuotes) {
      inAngleBrackets = false;
      continue;
    }

    if (char === ',' && !inQuotes && !inAngleBrackets) {
      values.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  values.push(value.slice(start).trim());
  return values.filter((value) => value.length > 0);
}

/** A decoded operation result with HTTP response metadata. */
export class OperationResponse<R> {
  readonly result: R;
  readonly transportResponse: Response;
  readonly status: number;
  readonly headers: ResponseHeaders;

  constructor(result: R, transportResponse: Response) {
    this.result = result;
    this.transportResponse = transportResponse;
    this.status = transportResponse.status;
    this.headers = ResponseHeaders.from(transportResponse.headers);
  }

  /** Retrieves all response header values matching `name`. */
  getHeaders(name: string): readonly string[] {
    return this.headers.getAll(name);
  }

  /** Retrieves the first response header value matching `name`. */
  getHeader(name: string): string | undefined {
    return this.headers.get(name);
  }

  /** Parsed `Content-Type` header value. */
  get contentType(): MediaType | undefined {
    return this.headers.contentType;
  }
}
