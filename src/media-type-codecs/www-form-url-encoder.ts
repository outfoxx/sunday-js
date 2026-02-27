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
import { DateEncoding, expectObject, SerializationContext, Serde } from '../serde';
import { encodeSeconds } from '../util/temporal';
import { URLQueryParamsEncoder } from './media-type-encoder';

export class WWWFormUrlEncoder implements URLQueryParamsEncoder {
  static get default(): WWWFormUrlEncoder {
    return new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
    );
  }

  constructor(
    private arrayEncoding: WWWFormUrlEncoder.ArrayEncoding,
    private boolEncoding: WWWFormUrlEncoder.BoolEncoding,
    private dateEncoding: WWWFormUrlEncoder.DateEncoding,
    private encoder = new TextEncoder(),
  ) {}

  encode<T = unknown>(value: T, type?: Serde<T>): BodyInit {
    const ctx: SerializationContext = {
      format: 'json',
      dateEncoding: this.dateEncoding as unknown as DateEncoding,
      includeNulls: false,
    };
    const parameters = type ? type.serialize(value, ctx) : value;

    return this.encoder.encode(this.encodeQueryString(expectObject(parameters, 'form')));
  }

  encodeQueryString(parameters: Record<string, unknown>): string {
    const components: string[] = [];

    for (const [key, value] of Object.entries(parameters).sort()) {
      components.push(...this.encodeQueryComponent(key, value));
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
    } else if (value instanceof Array || value instanceof Set) {
      // encode key according to `arrayEncoding`
      for (const item of value) {
        components.push(
          ...this.encodeQueryComponent(
            encodeArrayKey(key, this.arrayEncoding),
            item,
          ),
        );
      }
    } else if (value instanceof Map) {
      //
      for (const [nestedKey, nestedValue] of Array.from(
        value.entries(),
      ).sort()) {
        components.push(
          ...this.encodeQueryComponent(`${key}[${nestedKey}]`, nestedValue),
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
              this.dateEncoding,
            ),
          ),
      );
    } else if (value instanceof Temporal) {
      //
      components.push(
        encodeURIComponent(key) + '=' +
          encodeURIComponent(encodeTemporal(value, this.dateEncoding)),
      );
    } else if (typeof value === 'boolean') {
      //
      components.push(
        encodeURIComponent(key) +
          '=' +
          encodeURIComponent(encodeBool(value, this.boolEncoding)),
      );
    } else if (value instanceof URL) {
      //
      components.push(encodeURIComponent(key) + '=' + encodeURIComponent(value.toString()));
    } else if (value instanceof ArrayBuffer) {
      throw Error('Encoding ArrayBuffer to form data is not supported');
    } else if (typeof value === 'object') {
      //
      for (const [nestedKey, nestedValue] of Object.entries(value).sort()) {
        components.push(
          ...this.encodeQueryComponent(`${key}[${nestedKey}]`, nestedValue),
        );
      }
    } else {
      //
      components.push(encodeURIComponent(key) + '=' + encodeURIComponent(`${value}`));
    }

    return components;
  }
}

function encodeInstant(
  instant: Instant,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  switch (dateEncoding) {
    case WWWFormUrlEncoder.DateEncoding.ISO8601:
      return DateTimeFormatter.ISO_INSTANT.format(instant);
    case WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return `${instant.toEpochMilli()}`;
    case WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
      return `${instant.epochSecond() + instant.nano() / 1000000000.0}`;
  }
}

function encodeTemporal(
  temporal: Temporal,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (temporal instanceof Instant) {
    return encodeInstant(temporal, dateEncoding);
  } else if (temporal instanceof ZonedDateTime) {
    return encodeInstant(temporal.toInstant(), dateEncoding);
  } else if (temporal instanceof OffsetDateTime) {
    return encodeInstant(temporal.toInstant(), dateEncoding);
  } else if (temporal instanceof OffsetTime) {
    if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
      return temporal.toString();
    }
    return encodeSeconds(temporal.second(), temporal.nano()).join(',');
  } else if (temporal instanceof LocalDateTime) {
    if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
      return temporal.toString();
    }
    return encodeSeconds(temporal.second(), temporal.nano()).join(',');
  } else if (temporal instanceof LocalDate) {
    return temporal.toString();
  } else if (temporal instanceof LocalTime) {
    if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
      return temporal.toString();
    }
    return encodeSeconds(temporal.second(), temporal.nano()).join(',');
  }
  return temporal.toString();
}

function encodeBool(
  value: boolean,
  boolEncoding: WWWFormUrlEncoder.BoolEncoding,
): string {
  switch (boolEncoding) {
    case WWWFormUrlEncoder.BoolEncoding.LITERAL:
      return value ? 'true' : 'false';
    case WWWFormUrlEncoder.BoolEncoding.NUMERIC:
      return value ? '1' : '0';
  }
}

function encodeArrayKey(
  key: string,
  arrayEncoding: WWWFormUrlEncoder.ArrayEncoding,
): string {
  switch (arrayEncoding) {
    case WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED:
      return key;
    case WWWFormUrlEncoder.ArrayEncoding.BRACKETED:
      return `${key}[]`;
  }
}

export namespace WWWFormUrlEncoder {
  export enum ArrayEncoding {
    UNBRACKETED,
    BRACKETED,
  }

  export enum BoolEncoding {
    LITERAL,
    NUMERIC,
  }

  export enum DateEncoding {
    DECIMAL_SECONDS_SINCE_EPOCH,
    MILLISECONDS_SINCE_EPOCH,
    ISO8601,
  }
}
