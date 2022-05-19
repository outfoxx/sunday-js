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

import {
  DateTimeFormatter,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  Temporal,
  ZonedDateTime,
} from '@js-joda/core';
import { JsonStringifier } from '@outfoxx/jackson-js';
import { URLQueryParamsEncoder } from './media-type-encoder';

export class WWWFormUrlEncoder implements URLQueryParamsEncoder {
  static get default(): WWWFormUrlEncoder {
    return new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
    );
  }

  constructor(
    private arrayEncoding: WWWFormUrlEncoder.ArrayEncoding,
    private boolEncoding: WWWFormUrlEncoder.BoolEncoding,
    private dateEncoding: WWWFormUrlEncoder.DateEncoding,
    private json = new JsonStringifier(),
    private encoder = new TextEncoder()
  ) {}

  encode<T = unknown>(value: T): ArrayBuffer | SharedArrayBuffer {
    const parameters = this.json.transform(value);

    return this.encoder.encode(this.encodeQueryString(parameters));
  }

  encodeQueryString(parameters: Record<string, unknown>): string {
    const components: string[] = [];

    for (const key of Object.keys(parameters).sort()) {
      components.push(...this.encodeQueryComponent(key, parameters[key]));
    }
    return components.join('&');
  }

  encodeQueryComponent(key: string, value: unknown): string[] {
    const components: string[] = [];

    if (value === undefined) {
      return components;
    }

    if (value == null) {
      //
      components.push(encodeURIComponent(key));
    } else if (value instanceof Array) {
      // encode key according to `arrayEncoding`
      for (const item of value) {
        components.push(
          ...this.encodeQueryComponent(
            encodeArrayKey(key, this.arrayEncoding),
            item
          )
        );
      }
    } else if (value instanceof Date) {
      //
      components.push(
        encodeURIComponent(key) +
          '=' +
          encodeURIComponent(
            encodeInstant(
              Instant.ofEpochMilli(value.getTime()),
              this.dateEncoding
            )
          )
      );
    } else if (value instanceof Temporal) {
      //
      components.push(
        encodeURIComponent(key) +
          '=' +
          encodeURIComponent(encodeTemporal(value, this.dateEncoding))
      );
    } else if (typeof value === 'boolean') {
      //
      components.push(
        encodeURIComponent(key) +
          '=' +
          encodeURIComponent(encodeBoolean(value, this.boolEncoding))
      );
    } else if (typeof value === 'object') {
      //
      const rec = (value ?? {}) as Record<string, unknown>;

      for (const nestedKey of Object.keys(rec).sort()) {
        components.push(
          ...this.encodeQueryComponent(`${key}[${nestedKey}]`, rec[nestedKey])
        );
      }
    } else {
      //
      components.push(
        encodeURIComponent(key) + '=' + encodeURIComponent(`${value}`)
      );
    }

    return components;
  }
}

function encodeArrayKey(
  key: string,
  encoding: WWWFormUrlEncoder.ArrayEncoding
): string {
  return encoding === WWWFormUrlEncoder.ArrayEncoding.BRACKETED
    ? `${key}[]`
    : key;
}

function encodeBoolean(
  value: boolean,
  encoding: WWWFormUrlEncoder.BoolEncoding
): string {
  switch (encoding) {
    case WWWFormUrlEncoder.BoolEncoding.NUMERIC:
      return value ? '1' : '0';
    case WWWFormUrlEncoder.BoolEncoding.LITERAL:
      return value ? 'true' : 'false';
    default:
      throw new Error('unknown boolean encoding');
  }
}

function encodeTemporal(
  value: Temporal,
  encoding: WWWFormUrlEncoder.DateEncoding
): string {
  if (value instanceof Instant) {
    return encodeInstant(value, encoding);
  } else if (value instanceof OffsetDateTime) {
    if (encoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
      return value.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
    return encodeInstant(value.toInstant(), encoding);
  } else if (value instanceof ZonedDateTime) {
    if (encoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
      return value.format(DateTimeFormatter.ISO_ZONED_DATE_TIME);
    }
    return encodeInstant(value.toInstant(), encoding);
  } else if (value instanceof LocalDateTime) {
    return value.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
  } else if (value instanceof LocalDate) {
    return value.format(DateTimeFormatter.ISO_LOCAL_DATE);
  } else if (value instanceof LocalTime) {
    return value.format(DateTimeFormatter.ISO_LOCAL_TIME);
  } else if (value instanceof OffsetTime) {
    return value.format(DateTimeFormatter.ISO_OFFSET_TIME);
  } else {
    throw Error('unsupported temporal value for ');
  }
}

function encodeInstant(
  value: Instant,
  encoding: WWWFormUrlEncoder.DateEncoding
): string {
  switch (encoding) {
    case WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
      return (value.epochSecond() + value.nano() / 1_000_000_000.0).toFixed(7);
    case WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return `${value.toEpochMilli()}`;
    case WWWFormUrlEncoder.DateEncoding.ISO8601:
      return DateTimeFormatter.ISO_INSTANT.format(value);
    default:
      throw new Error('unknown date encoding');
  }
}

export namespace WWWFormUrlEncoder {
  /**
   * Configures how `Array` parameters are encoded.
   */
  export enum ArrayEncoding {
    /**
     * An empty set of square brackets is appended to the key for every value. This is the default behavior.
     */
    BRACKETED,
    /**
     * No brackets are appended. The key is encoded as is.
     */
    UNBRACKETED,
  }

  /**
   * Configures how `Bool` parameters are encoded.
   */
  export enum BoolEncoding {
    /**
     * Encode `true` as `1` and `false` as `0`. This is the default behavior.
     */
    NUMERIC,
    /**
     * Encode `true` and `false` as string literals.
     */
    LITERAL,
  }

  /**
   * Configures how `Date` parameters are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode the `Date` as a UNIX timestamp (decimal seconds since epoch).
     */
    DECIMAL_SECONDS_SINCE_EPOCH,

    /**
     * Encode the `Date` as UNIX millisecond timestamp (integer milliseconds since epoch).
     */
    MILLISECONDS_SINCE_EPOCH,

    /**
     * Encode the `Date` as an ISO-8601-formatted string (in RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
