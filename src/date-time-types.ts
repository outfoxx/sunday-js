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
  ChronoField,
  DateTimeFormatter,
  DateTimeFormatterBuilder,
  Duration as JsJodaDuration,
  Instant as JsJodaInstant,
  LocalDate as JsJodaLocalDate,
  LocalDateTime as JsJodaLocalDateTime,
  LocalTime as JsJodaLocalTime,
  OffsetDateTime as JsJodaOffsetDateTime,
  OffsetTime as JsJodaOffsetTime,
  Period as JsJodaPeriod,
  ResolverStyle,
  Temporal as JsJodaTemporal,
  ZonedDateTime as JsJodaZonedDateTime,
  ZoneId as JsJodaZoneId,
  ZoneOffset as JsJodaZoneOffset,
} from '@js-joda/core';
import { TaggedValue } from 'cbor-redux';
import { z } from 'zod';
import { epochDateTimeTag, isoDateTimeTag } from './media-type-codecs/cbor-tags.js';
import { DateEncoding, NumericDateDecoding, type SchemaPolicy } from './schema-policy.js';
import { defineSchema } from './schema-runtime.js';
import { secondsToNumber } from './util/numbers.js';

export type Temporal = JsJodaTemporal;
export type Instant = JsJodaInstant;
export type LocalDate = JsJodaLocalDate;
export type LocalTime = JsJodaLocalTime;
export type LocalDateTime = JsJodaLocalDateTime;
export type OffsetTime = JsJodaOffsetTime;
export type OffsetDateTime = JsJodaOffsetDateTime;
export type ZonedDateTime = JsJodaZonedDateTime;
export type Duration = JsJodaDuration;
export type Period = JsJodaPeriod;
export type ZoneId = JsJodaZoneId;
export type ZoneOffset = JsJodaZoneOffset;

export const Temporal = JsJodaTemporal;
export const Instant = JsJodaInstant;
export const LocalDate = JsJodaLocalDate;
export const LocalTime = JsJodaLocalTime;
export const LocalDateTime = JsJodaLocalDateTime;
export const OffsetTime = JsJodaOffsetTime;
export const OffsetDateTime = JsJodaOffsetDateTime;
export const ZonedDateTime = JsJodaZonedDateTime;
export const Duration = JsJodaDuration;
export const Period = JsJodaPeriod;
export const ZoneId = JsJodaZoneId
export const ZoneOffset = JsJodaZoneOffset;

type CodecContext = {
  issues: Array<unknown>;
};

type TaggedTemporalValue =
  | { tag: typeof isoDateTimeTag; value: string }
  | { tag: typeof epochDateTimeTag; value: number };

const TAGGED_VALUE_SCHEMA = z.instanceof(TaggedValue);

const DATE_OUTPUT_SCHEMA = z.instanceof(Date);
const INSTANT_OUTPUT_SCHEMA = z.custom<JsJodaInstant>((value): value is JsJodaInstant => value instanceof Instant);
const ZONED_DATE_TIME_OUTPUT_SCHEMA = z.custom<JsJodaZonedDateTime>(
  (value): value is JsJodaZonedDateTime => value instanceof ZonedDateTime,
);
const OFFSET_DATE_TIME_OUTPUT_SCHEMA = z.custom<JsJodaOffsetDateTime>(
  (value): value is JsJodaOffsetDateTime => value instanceof OffsetDateTime,
);
const OFFSET_TIME_OUTPUT_SCHEMA = z.custom<JsJodaOffsetTime>(
  (value): value is JsJodaOffsetTime => value instanceof OffsetTime,
);
const LOCAL_DATE_TIME_OUTPUT_SCHEMA = z.custom<JsJodaLocalDateTime>(
  (value): value is JsJodaLocalDateTime => value instanceof LocalDateTime,
);
const LOCAL_DATE_OUTPUT_SCHEMA = z.custom<JsJodaLocalDate>(
  (value): value is JsJodaLocalDate => value instanceof LocalDate,
);
const LOCAL_TIME_OUTPUT_SCHEMA = z.custom<JsJodaLocalTime>(
  (value): value is JsJodaLocalTime => value instanceof LocalTime,
);
const DURATION_OUTPUT_SCHEMA = z.custom<JsJodaDuration>(
  (value): value is JsJodaDuration => value instanceof Duration,
);

const INSTANT_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const INSTANT_CBOR_INPUT_SCHEMA = z.union([z.string(), z.number(), TAGGED_VALUE_SCHEMA]);

const ZONED_DATE_TIME_STRUCT_SCHEMA = z.tuple([z.number(), z.string(), z.string()]);
const ZONED_DATE_TIME_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const ZONED_DATE_TIME_CBOR_INPUT_SCHEMA = z.union([z.string(), ZONED_DATE_TIME_STRUCT_SCHEMA, TAGGED_VALUE_SCHEMA]);

const OFFSET_DATE_TIME_STRUCT_SCHEMA = z.tuple([z.number(), z.string()]);
const OFFSET_DATE_TIME_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const OFFSET_DATE_TIME_CBOR_INPUT_SCHEMA = z.union([z.string(), OFFSET_DATE_TIME_STRUCT_SCHEMA, TAGGED_VALUE_SCHEMA]);

const OFFSET_TIME_STRUCT_SCHEMA = z.tuple([z.number(), z.string()]);
const OFFSET_TIME_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const OFFSET_TIME_CBOR_INPUT_SCHEMA = z.union([z.string(), OFFSET_TIME_STRUCT_SCHEMA]);

const LOCAL_DATE_TIME_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const LOCAL_DATE_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const LOCAL_TIME_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const DURATION_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const DURATION_CBOR_INPUT_SCHEMA = z.union([z.string(), z.number()]);

const DATE_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const DATE_CBOR_INPUT_SCHEMA = z.union([z.string(), z.number(), TAGGED_VALUE_SCHEMA]);

const offsetTimeFormatter = new DateTimeFormatterBuilder()
  .parseCaseInsensitive()
  .append(DateTimeFormatter.ISO_LOCAL_TIME)
  .appendOffsetId()
  .toFormatter(ResolverStyle.STRICT);

const instantCodecByPolicy = new Map<string, z.ZodType<JsJodaInstant>>();
const zonedDateTimeCodecByPolicy = new Map<string, z.ZodType<JsJodaZonedDateTime>>();
const offsetDateTimeCodecByPolicy = new Map<string, z.ZodType<JsJodaOffsetDateTime>>();
const offsetTimeCodecByPolicy = new Map<string, z.ZodType<JsJodaOffsetTime>>();
const localDateTimeCodecByPolicy = new Map<string, z.ZodType<JsJodaLocalDateTime>>();
const localDateCodecByPolicy = new Map<string, z.ZodType<JsJodaLocalDate>>();
const localTimeCodecByPolicy = new Map<string, z.ZodType<JsJodaLocalTime>>();
const durationCodecByPolicy = new Map<string, z.ZodType<JsJodaDuration>>();
const dateCodecByPolicy = new Map<string, z.ZodType<Date>>();

function policyKey(policy: SchemaPolicy): string {
  return [
    policy.format,
    policy.dateEncoding.toString(),
    policy.numericDateDecoding.toString(),
  ].join(':');
}

function codecForPolicy<T>(
  cache: Map<string, z.ZodType<T>>,
  policy: SchemaPolicy,
  factory: (policy: SchemaPolicy) => z.ZodType<T>,
): z.ZodType<T> {
  const key = policyKey(policy);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const schema = factory(policy);
  cache.set(key, schema);
  return schema;
}

function pushIssue(ctx: CodecContext, message: string, input: unknown): typeof z.NEVER {
  ctx.issues.push({
    code: 'custom',
    message,
    input,
  });
  return z.NEVER;
}

function splitEpochSeconds(value: number): { seconds: number; nanos: number } {
  let seconds = Math.trunc(value);
  const fraction = value - seconds;
  let nanos = Math.round((fraction * 1_000_000_000) / 1_000) * 1_000;
  if (nanos >= 1_000_000_000) {
    seconds += 1;
    nanos = 0;
  }
  if (nanos < 0) {
    seconds -= 1;
    nanos += 1_000_000_000;
  }
  return { seconds, nanos };
}

function splitEpochMilliseconds(value: number): { seconds: number; nanos: number } {
  let seconds = Math.trunc(value / 1000);
  const millis = value - seconds * 1000;
  let nanos = Math.round(millis * 1_000_000);
  if (nanos >= 1_000_000_000) {
    seconds += 1;
    nanos = 0;
  }
  if (nanos < 0) {
    seconds -= 1;
    nanos += 1_000_000_000;
  }
  return { seconds, nanos };
}

function splitEpochByNumericPolicy(value: number, policy: SchemaPolicy): { seconds: number; nanos: number } {
  if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
    return splitEpochMilliseconds(value);
  }
  return splitEpochSeconds(value);
}

function decodeInstantFromNumericPolicy(value: number, policy: SchemaPolicy): JsJodaInstant {
  if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
    return Instant.ofEpochMilli(value);
  }
  const { seconds, nanos } = splitEpochSeconds(value);
  return Instant.ofEpochSecond(seconds, nanos);
}

function decodeInstantFromEpochSeconds(value: number): JsJodaInstant {
  const { seconds, nanos } = splitEpochSeconds(value);
  return Instant.ofEpochSecond(seconds, nanos);
}

function decodeLocalDateTimeFromNumber(value: number, policy: SchemaPolicy): JsJodaLocalDateTime {
  const { seconds, nanos } = splitEpochByNumericPolicy(value, policy);
  return LocalDateTime.ofEpochSecond(seconds, nanos, ZoneOffset.UTC);
}

function decodeLocalTimeFromNumber(value: number, policy: SchemaPolicy): JsJodaLocalTime {
  const { seconds, nanos } = splitEpochByNumericPolicy(value, policy);
  const secondsInDay = ((seconds % 86400) + 86400) % 86400;
  return LocalTime.ofNanoOfDay(secondsInDay * 1_000_000_000 + nanos);
}

function encodeLocalDateTimeNumber(value: JsJodaLocalDateTime, dateEncoding: DateEncoding): number {
  const seconds = value.toEpochSecond(ZoneOffset.UTC);
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return seconds * 1000 + value.get(ChronoField.MILLI_OF_SECOND);
  }
  return secondsToNumber(seconds, value.nano());
}

function encodeLocalDateNumber(value: JsJodaLocalDate, dateEncoding: DateEncoding): number {
  const seconds = value.atStartOfDay().toEpochSecond(ZoneOffset.UTC);
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return seconds * 1000;
  }
  return secondsToNumber(seconds, 0);
}

function encodeLocalTimeNumber(value: JsJodaLocalTime, dateEncoding: DateEncoding): number {
  const seconds = value.hour() * 3600 + value.minute() * 60 + value.second();
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return seconds * 1000 + value.get(ChronoField.MILLI_OF_SECOND);
  }
  return secondsToNumber(seconds, value.nano());
}

function parseIsoInstant(value: string, ctx: CodecContext): JsJodaInstant | typeof z.NEVER {
  try {
    return Instant.from(DateTimeFormatter.ISO_INSTANT.parse(value));
  }
  catch {
    return pushIssue(ctx, `Invalid ISO instant: ${value}`, value);
  }
}

function parseIsoZonedDateTime(value: string, ctx: CodecContext): JsJodaZonedDateTime | typeof z.NEVER {
  try {
    return ZonedDateTime.from(DateTimeFormatter.ISO_ZONED_DATE_TIME.parse(value));
  }
  catch {
    return pushIssue(ctx, `Invalid ISO zoned date-time: ${value}`, value);
  }
}

function parseIsoOffsetDateTime(value: string, ctx: CodecContext): JsJodaOffsetDateTime | typeof z.NEVER {
  try {
    return OffsetDateTime.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(value));
  }
  catch {
    return pushIssue(ctx, `Invalid ISO offset date-time: ${value}`, value);
  }
}

function parseIsoDate(value: string, ctx: CodecContext): Date | typeof z.NEVER {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return pushIssue(ctx, `Invalid ISO date-time: ${value}`, value);
  }
  return parsed;
}

function parseIsoDuration(value: string, ctx: CodecContext): JsJodaDuration | typeof z.NEVER {
  try {
    return Duration.parse(value);
  }
  catch {
    return pushIssue(ctx, `Invalid ISO duration: ${value}`, value);
  }
}

function decodeTaggedTemporal(tagged: TaggedValue, ctx: CodecContext): TaggedTemporalValue | typeof z.NEVER {
  switch (tagged.tag) {
    case isoDateTimeTag:
      if (typeof tagged.value !== 'string') {
        return pushIssue(ctx, 'CBOR tag 0 must contain a string datetime', tagged.value);
      }
      return { tag: isoDateTimeTag, value: tagged.value };
    case epochDateTimeTag:
      if (typeof tagged.value !== 'number') {
        return pushIssue(ctx, 'CBOR tag 1 must contain epoch-seconds', tagged.value);
      }
      return { tag: epochDateTimeTag, value: tagged.value };
    default:
      ctx.issues.push({
        code: 'invalid_value',
        values: [isoDateTimeTag, epochDateTimeTag],
        input: tagged.tag,
        message: 'Invalid CBOR tag for temporal decoding',
      });
      return z.NEVER;
  }
}

function createInstantSchema(policy: SchemaPolicy): z.ZodType<JsJodaInstant> {
  switch (policy.format) {
    case 'json':
      return z.codec(INSTANT_JSON_INPUT_SCHEMA, INSTANT_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          switch (typeof value) {
            case 'string':
              return parseIsoInstant(value, ctx);
            case 'number':
              return decodeInstantFromNumericPolicy(value, policy);
          }
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return DateTimeFormatter.ISO_INSTANT.format(value);
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.toEpochMilli();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
              return secondsToNumber(value.epochSecond(), value.nano());
          }
        },
      });
    case 'cbor':
      return z.codec(INSTANT_CBOR_INPUT_SCHEMA, INSTANT_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          switch (typeof value) {
            case 'string':
              return parseIsoInstant(value, ctx);
            case 'number':
              return decodeInstantFromNumericPolicy(value, policy);
            default: {
              const tagged = decodeTaggedTemporal(value, ctx);
              if (tagged === z.NEVER) {
                return z.NEVER;
              }
              return tagged.tag === isoDateTimeTag
                ? parseIsoInstant(tagged.value, ctx)
                : decodeInstantFromEpochSeconds(tagged.value);
            }
          }
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return new TaggedValue(DateTimeFormatter.ISO_INSTANT.format(value), isoDateTimeTag);
          }
          return new TaggedValue(secondsToNumber(value.epochSecond(), value.nano()), epochDateTimeTag);
        },
      });
  }
}

function createZonedDateTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaZonedDateTime> {
  switch (policy.format) {
    case 'json':
      return z.codec(ZONED_DATE_TIME_JSON_INPUT_SCHEMA, ZONED_DATE_TIME_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoZonedDateTime(value, ctx);
          }
          return ZonedDateTime.ofInstant(decodeInstantFromNumericPolicy(value, policy), ZoneId.UTC);
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return DateTimeFormatter.ISO_ZONED_DATE_TIME.format(value);
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.withZoneSameInstant(ZoneOffset.UTC).toInstant().toEpochMilli();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
              const instant = value.withZoneSameInstant(ZoneOffset.UTC).toInstant()
              return secondsToNumber(instant.epochSecond(), value.nano());
            }
          }
        },
      });
    case 'cbor':
      return z.codec(ZONED_DATE_TIME_CBOR_INPUT_SCHEMA, ZONED_DATE_TIME_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (value instanceof TaggedValue) {
            const tagged = decodeTaggedTemporal(value, ctx);
            if (tagged === z.NEVER) {
              return z.NEVER;
            }
            return tagged.tag === isoDateTimeTag
              ? parseIsoZonedDateTime(tagged.value, ctx)
              : ZonedDateTime.ofInstant(decodeInstantFromEpochSeconds(tagged.value), ZoneId.UTC);
          }
          if (typeof value === 'string') {
            return parseIsoZonedDateTime(value, ctx);
          }
          const [localNumber, offset, zoneId] = value;
          return ZonedDateTime.ofLocal(
            decodeLocalDateTimeFromNumber(localNumber, policy),
            ZoneId.of(zoneId),
            ZoneOffset.of(offset),
          );
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return DateTimeFormatter.ISO_ZONED_DATE_TIME.format(value);
          }
          return [
            encodeLocalDateTimeNumber(value.toLocalDateTime(), policy.dateEncoding),
            value.offset().toString(),
            value.zone().id(),
          ] as [number, string, string];
        },
      });
  }
}

function createOffsetDateTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaOffsetDateTime> {
  switch (policy.format) {
    case 'json':
      return z.codec(OFFSET_DATE_TIME_JSON_INPUT_SCHEMA, OFFSET_DATE_TIME_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoOffsetDateTime(value, ctx);
          }
          return OffsetDateTime.ofInstant(decodeInstantFromNumericPolicy(value, policy), ZoneOffset.UTC);
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value);
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.withOffsetSameInstant(ZoneOffset.UTC).toInstant().toEpochMilli();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
              const instant = value.withOffsetSameInstant(ZoneOffset.UTC).toInstant()
              return secondsToNumber(instant.epochSecond(), value.nano());
            }
          }
        },
      });
    case 'cbor':
      return z.codec(OFFSET_DATE_TIME_CBOR_INPUT_SCHEMA, OFFSET_DATE_TIME_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (value instanceof TaggedValue) {
            const tagged = decodeTaggedTemporal(value, ctx);
            if (tagged === z.NEVER) {
              return z.NEVER;
            }
            return tagged.tag === isoDateTimeTag
              ? parseIsoOffsetDateTime(tagged.value, ctx)
              : OffsetDateTime.ofInstant(decodeInstantFromEpochSeconds(tagged.value), ZoneOffset.UTC);
          }
          if (typeof value === 'string') {
            return parseIsoOffsetDateTime(value, ctx);
          }
          const [localNumber, offset] = value;
          return OffsetDateTime.of(
            decodeLocalDateTimeFromNumber(localNumber, policy),
            ZoneOffset.of(offset),
          );
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return new TaggedValue(DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value), isoDateTimeTag);
          }
          return [
            encodeLocalDateTimeNumber(value.toLocalDateTime(), policy.dateEncoding),
            value.offset().toString(),
          ] as [number, string];
        },
      });
  }
}

function createOffsetTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaOffsetTime> {
  switch (policy.format) {
    case 'json':
      return z.codec(OFFSET_TIME_JSON_INPUT_SCHEMA, OFFSET_TIME_OUTPUT_SCHEMA, {
        decode: (value) => {
          if (typeof value === 'string') {
            return OffsetTime.parse(value, offsetTimeFormatter);
          }
          return OffsetTime.of(decodeLocalTimeFromNumber(value, policy), ZoneOffset.UTC);
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return offsetTimeFormatter.format(value);
          }
          const local = value.withOffsetSameInstant(ZoneOffset.UTC).toLocalTime()
          return encodeLocalTimeNumber(local, policy.dateEncoding);
        }
      })
    case 'cbor':
      return z.codec(OFFSET_TIME_CBOR_INPUT_SCHEMA, OFFSET_TIME_OUTPUT_SCHEMA, {
        decode: (value) => {
          if (typeof value === 'string') {
            return OffsetTime.parse(value, offsetTimeFormatter);
          }
          const [localNumber, offset] = value;
          return OffsetTime.of(
            decodeLocalTimeFromNumber(localNumber, policy),
            ZoneOffset.of(offset),
          );
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return offsetTimeFormatter.format(value);
          }
          return [
            encodeLocalTimeNumber(value.toLocalTime(), policy.dateEncoding),
            value.offset().toString(),
          ] as [number, string];
        },
      });
  }
}

function createLocalDateTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalDateTime> {
  return z.codec(LOCAL_DATE_TIME_INPUT_SCHEMA, LOCAL_DATE_TIME_OUTPUT_SCHEMA, {
    decode: (value) => {
      if (typeof value === 'string') {
        return LocalDateTime.parse(value);
      }
      return decodeLocalDateTimeFromNumber(value, policy);
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(value);
      }
      return encodeLocalDateTimeNumber(value, policy.dateEncoding);
    },
  });
}

function createLocalDateSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalDate> {
  return z.codec(LOCAL_DATE_INPUT_SCHEMA, LOCAL_DATE_OUTPUT_SCHEMA, {
    decode: (value) => {
      if (typeof value === 'string') {
        return LocalDate.parse(value);
      }
      const { seconds } = splitEpochByNumericPolicy(value, policy);
      return LocalDate.ofEpochDay(Math.floor(seconds / 86400));
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
      }
      return encodeLocalDateNumber(value, policy.dateEncoding);
    },
  });
}

function createLocalTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalTime> {
  return z.codec(LOCAL_TIME_INPUT_SCHEMA, LOCAL_TIME_OUTPUT_SCHEMA, {
    decode: (value) => {
      if (typeof value === 'string') {
        return LocalTime.parse(value);
      }
      return decodeLocalTimeFromNumber(value, policy);
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
      }
      return encodeLocalTimeNumber(value, policy.dateEncoding);
    },
  });
}

function createDurationSchema(policy: SchemaPolicy): z.ZodType<JsJodaDuration> {
  switch (policy.format) {
    case 'json':
      return z.codec(DURATION_JSON_INPUT_SCHEMA, DURATION_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoDuration(value, ctx);
          }
          if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
            return Duration.ofMillis(value);
          }
          const { seconds, nanos } = splitEpochSeconds(value);
          return Duration.ofSeconds(seconds, nanos);
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return value.toString();
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.toMillis();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
              return secondsToNumber(value.seconds(), value.nano());
          }
        },
      });
    case 'cbor':
      return z.codec(DURATION_CBOR_INPUT_SCHEMA, DURATION_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoDuration(value, ctx);
          }
          if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
            return Duration.ofMillis(value);
          }
          const { seconds, nanos } = splitEpochSeconds(value);
          return Duration.ofSeconds(seconds, nanos);
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return value.toString();
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.toMillis();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
              return secondsToNumber(value.seconds(), value.nano());
          }
        },
      });
  }
}

function createDateSchema(policy: SchemaPolicy): z.ZodType<Date> {
  switch (policy.format) {
    case 'json':
      return z.codec(DATE_JSON_INPUT_SCHEMA, DATE_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoDate(value, ctx);
          }
          if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
            return new Date(value);
          }
          return new Date(value * 1000);
        },
        encode: (value) => {
          switch (policy.dateEncoding) {
            case DateEncoding.ISO8601:
              return value.toISOString();
            case DateEncoding.MILLISECONDS_SINCE_EPOCH:
              return value.getTime();
            case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
              return value.getTime() / 1000.0;
          }
        },
      });
    case 'cbor':
      return z.codec(DATE_CBOR_INPUT_SCHEMA, DATE_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return parseIsoDate(value, ctx);
          }
          if (typeof value === 'number') {
            if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
              return new Date(value);
            }
            return new Date(value * 1000);
          }
          const tagged = decodeTaggedTemporal(value, ctx);
          if (tagged === z.NEVER) {
            return z.NEVER;
          }
          return tagged.tag === isoDateTimeTag
            ? parseIsoDate(tagged.value, ctx)
            : new Date(tagged.value * 1000);
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return new TaggedValue(value.toISOString(), isoDateTimeTag);
          }
          return new TaggedValue(value.getTime() / 1000, epochDateTimeTag);
        },
      });
  }
}

function instantCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaInstant> {
  return codecForPolicy(instantCodecByPolicy, policy, createInstantSchema);
}

function zonedDateTimeCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaZonedDateTime> {
  return codecForPolicy(zonedDateTimeCodecByPolicy, policy, createZonedDateTimeSchema);
}

function offsetDateTimeCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaOffsetDateTime> {
  return codecForPolicy(offsetDateTimeCodecByPolicy, policy, createOffsetDateTimeSchema);
}

function offsetTimeCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaOffsetTime> {
  return codecForPolicy(offsetTimeCodecByPolicy, policy, createOffsetTimeSchema);
}

function localDateTimeCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaLocalDateTime> {
  return codecForPolicy(localDateTimeCodecByPolicy, policy, createLocalDateTimeSchema);
}

function localDateCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaLocalDate> {
  return codecForPolicy(localDateCodecByPolicy, policy, createLocalDateSchema);
}

function localTimeCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaLocalTime> {
  return codecForPolicy(localTimeCodecByPolicy, policy, createLocalTimeSchema);
}

function durationCodecForPolicy(policy: SchemaPolicy): z.ZodType<JsJodaDuration> {
  return codecForPolicy(durationCodecByPolicy, policy, createDurationSchema);
}

function dateCodecForPolicy(policy: SchemaPolicy): z.ZodType<Date> {
  return codecForPolicy(dateCodecByPolicy, policy, createDateSchema);
}

export const DateSchema = defineSchema(
  (runtime) => dateCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/DateSchema'),
    debugName: 'DateSchema',
  },
);

export const InstantSchema = defineSchema(
  (runtime) => instantCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/InstantSchema'),
    debugName: 'InstantSchema',
  },
);

export const ZonedDateTimeSchema = defineSchema(
  (runtime) => zonedDateTimeCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/ZonedDateTimeSchema'),
    debugName: 'ZonedDateTimeSchema',
  },
);

export const OffsetDateTimeSchema = defineSchema(
  (runtime) => offsetDateTimeCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/OffsetDateTimeSchema'),
    debugName: 'OffsetDateTimeSchema',
  },
);

export const OffsetTimeSchema = defineSchema(
  (runtime) => offsetTimeCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/OffsetTimeSchema'),
    debugName: 'OffsetTimeSchema',
  },
);

export const LocalDateTimeSchema = defineSchema(
  (runtime) => localDateTimeCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/LocalDateTimeSchema'),
    debugName: 'LocalDateTimeSchema',
  },
);

export const LocalDateSchema = defineSchema(
  (runtime) => localDateCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/LocalDateSchema'),
    debugName: 'LocalDateSchema',
  },
);

export const LocalTimeSchema = defineSchema(
  (runtime) => localTimeCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/LocalTimeSchema'),
    debugName: 'LocalTimeSchema',
  },
);

export const DurationSchema = defineSchema(
  (runtime) => durationCodecForPolicy(runtime.policy),
  {
    id: Symbol.for('@outfoxx/sunday/DurationSchema'),
    debugName: 'DurationSchema',
  },
);
