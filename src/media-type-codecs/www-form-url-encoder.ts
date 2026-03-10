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
  DateTimeFormatter, Duration,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime, Period,
  Temporal, TemporalAmount,
  ZoneId,
  ZoneOffset,
  ZonedDateTime,
} from '@js-joda/core';
import { z } from 'zod';
import {
  ArrayBufferEncoding,
  createSchemaRuntime,
  DateEncoding,
  NumericDateDecoding,
  SchemaLike,
  SchemaRuntime,
} from '../schema-runtime.js';
import { appendNumericTimeFields, secondsToNumber } from '../util/numbers.js';
import { URLQueryParamsEncoder } from './media-type-encoder.js';

const FORM_OBJECT_SCHEMA = z.record(z.string(), z.unknown());

export class WWWFormUrlEncoder implements URLQueryParamsEncoder {
  static get default(): WWWFormUrlEncoder {
    return new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
    );
  }

  runtime: SchemaRuntime;

  constructor(
    private readonly arrayEncoding: WWWFormUrlEncoder.ArrayEncoding,
    private readonly boolEncoding: WWWFormUrlEncoder.BoolEncoding,
    private readonly dateEncoding: WWWFormUrlEncoder.DateEncoding,
    private readonly encoder = new TextEncoder(),
  ) {
    this.runtime = createSchemaRuntime({
      format: 'json',
      dateEncoding: this.dateEncoding as unknown as DateEncoding,
      numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      arrayBufferEncoding: ArrayBufferEncoding.BASE64,
    });
  }

  encode<T = unknown>(value: T, type?: SchemaLike<T>): BodyInit {
    const parameters = type
      ? this.runtime.resolveSchema(type).encode(value)
      : value;

    return this.encoder.encode(this.encodeQueryString(FORM_OBJECT_SCHEMA.parse(parameters)));
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
    } else if (Array.isArray(value) || value instanceof Set) {
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
    } else if (value instanceof TemporalAmount) {
      components.push(
        encodeURIComponent(key) + '=' +
          encodeURIComponent(encodeTemporalAmount(value, this.dateEncoding)),
      )
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
    } else if (value instanceof ZoneId || value instanceof ZoneOffset) {
      //
      components.push(encodeURIComponent(key) + '=' + encodeURIComponent(value.toString()));
    } else if (value instanceof ArrayBuffer) {
      //
      throw new TypeError('Encoding ArrayBuffer to form data is not supported');
    } else if (typeof value === 'object') {
      //
      for (const [nestedKey, nestedValue] of Object.entries(value).sort((e1, e2) => e1[0].localeCompare(e2[0], 'und'))) {
        components.push(
          ...this.encodeQueryComponent(`${key}[${nestedKey}]`, nestedValue),
        );
      }
    } else if (isStringInterpolable(value)) {
      //
      components.push(encodeURIComponent(key) + '=' + encodeURIComponent(`${value}`));
    } else {
      throw new TypeError(`Unsupported value type: ${typeof value}`);
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
      return `${secondsToNumber(instant.epochSecond(), instant.nano())}`;
  }
}

function encodeLocalDateTime(
  temporal: LocalDateTime,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
    return temporal.toString();
  }
  return JSON.stringify(appendNumericTimeFields(
    [
      temporal.year(),
      temporal.monthValue(),
      temporal.dayOfMonth(),
      temporal.hour(),
      temporal.minute(),
    ],
    temporal.second(),
    numericFraction(temporal.nano(), dateEncoding),
  ));
}

function encodeOffsetTime(
  temporal: OffsetTime,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
    return temporal.toString();
  }
  return JSON.stringify([
    ...appendNumericTimeFields(
      [temporal.hour(), temporal.minute()],
      temporal.second(),
      numericFraction(temporal.nano(), dateEncoding),
    ),
    temporal.offset().toString(),
  ]);
}

function encodeLocalTime(
  temporal: LocalTime,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
    return temporal.toString();
  }
  return JSON.stringify(
    appendNumericTimeFields(
      [temporal.hour(), temporal.minute()],
      temporal.second(),
      numericFraction(temporal.nano(), dateEncoding),
    ),
  );
}

function encodeLocalDate(
  temporal: LocalDate,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (dateEncoding == WWWFormUrlEncoder.DateEncoding.ISO8601) {
    return temporal.toString();
  }
  return JSON.stringify([
    temporal.year(),
    temporal.monthValue(),
    temporal.dayOfMonth(),
  ]);
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
  } else if (temporal instanceof LocalDateTime) {
    return encodeLocalDateTime(temporal, dateEncoding);
  } else if (temporal instanceof OffsetTime) {
    return encodeOffsetTime(temporal, dateEncoding);
  } else if (temporal instanceof LocalTime) {
    return encodeLocalTime(temporal, dateEncoding);
  } else if (temporal instanceof LocalDate) {
    return encodeLocalDate(temporal, dateEncoding);
  } else {
    throw new TypeError(`Unsupported Temporal type: ${temporal.constructor.name}`);
  }
}

function encodeDuration(
  duration: Duration,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  switch (dateEncoding) {
    case WWWFormUrlEncoder.DateEncoding.ISO8601:
      return duration.toString();
    case WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return `${duration.toMillis()}`;
    case WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
      return `${secondsToNumber(duration.seconds(), duration.nano())}`;
  }
}

function encodePeriod(
  period: Period,
): string {
  return period.toString();
}

function encodeTemporalAmount(
  temporalAmount: TemporalAmount,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): string {
  if (temporalAmount instanceof Duration) {
    return encodeDuration(temporalAmount, dateEncoding);
  } else if (temporalAmount instanceof Period) {
    return encodePeriod(temporalAmount);
  } else {
    throw new TypeError(`Unsupported TemporalAmount type: ${temporalAmount.constructor.name}`);
  }
}

function numericFraction(
  nanos: number,
  dateEncoding: WWWFormUrlEncoder.DateEncoding,
): number {
  switch (dateEncoding) {
    case WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return Math.trunc(nanos / 1_000_000);
    case WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
    case WWWFormUrlEncoder.DateEncoding.ISO8601:
      return nanos;
  }
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

function isStringInterpolable(value: unknown): value is string | number | bigint | boolean {
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'bigint' || type === 'boolean';
}
