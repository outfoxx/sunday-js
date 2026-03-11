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
import { epochDateTag, epochDateTimeTag, isoDateTimeTag } from './media-type-codecs/cbor-tags.js';
import { DateEncoding, NumericDateDecoding, type SchemaPolicy } from './schema-policy.js';
import { defineSchema } from './schema-runtime.js';
import { appendNumericTimeFields, secondsToNumber } from './util/numbers.js';

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
export const ZoneId = JsJodaZoneId;
export const ZoneOffset = JsJodaZoneOffset;

type CodecContext = {
  issues: Array<unknown>;
};

type TaggedTemporalValue =
  | { tag: typeof isoDateTimeTag; value: string }
  | { tag: typeof epochDateTimeTag; value: number };
type TaggedLocalDateValue = { tag: typeof epochDateTag; value: number };

// For CBOR, tagged payloads are emitted only when tag semantics align with Jackson wire values.
// Decoders still accept known tags and prioritize them when present.

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

const ZONED_DATE_TIME_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const ZONED_DATE_TIME_CBOR_INPUT_SCHEMA = z.union([z.string(), z.number(), TAGGED_VALUE_SCHEMA]);

const OFFSET_DATE_TIME_JSON_INPUT_SCHEMA = z.union([z.string(), z.number()]);
const OFFSET_DATE_TIME_CBOR_INPUT_SCHEMA = z.union([z.string(), z.number(), TAGGED_VALUE_SCHEMA]);

const LOCAL_DATE_TIME_ARRAY_INPUT_SCHEMA = z.array(z.number());
const LOCAL_DATE_ARRAY_INPUT_SCHEMA = z.array(z.number());
const LOCAL_TIME_ARRAY_INPUT_SCHEMA = z.array(z.number());
const OFFSET_TIME_ARRAY_INPUT_SCHEMA = z.array(z.union([z.number(), z.string()]));

const OFFSET_TIME_INPUT_SCHEMA = z.union([z.string(), OFFSET_TIME_ARRAY_INPUT_SCHEMA]);

const LOCAL_DATE_TIME_INPUT_SCHEMA = z.union([z.string(), LOCAL_DATE_TIME_ARRAY_INPUT_SCHEMA]);
const LOCAL_DATE_JSON_INPUT_SCHEMA = z.union([z.string(), LOCAL_DATE_ARRAY_INPUT_SCHEMA]);
const LOCAL_DATE_CBOR_INPUT_SCHEMA = z.union([z.string(), LOCAL_DATE_ARRAY_INPUT_SCHEMA, TAGGED_VALUE_SCHEMA]);
const LOCAL_TIME_INPUT_SCHEMA = z.union([z.string(), LOCAL_TIME_ARRAY_INPUT_SCHEMA]);
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

function decodeFractionToNanos(fraction: number, policy: SchemaPolicy): number {
  if (!Number.isInteger(fraction) || fraction < 0) {
    throw new Error('Fractional component must be a non-negative integer');
  }
  if (policy.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
    return fraction * 1_000_000;
  }
  return fraction;
}

function encodeFractionFromNanos(nanos: number, dateEncoding: DateEncoding): number {
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return Math.trunc(nanos / 1_000_000);
  }
  return nanos;
}

function encodeLocalDateTimeArray(value: JsJodaLocalDateTime, dateEncoding: DateEncoding): number[] {
  return appendNumericTimeFields(
    [value.year(), value.monthValue(), value.dayOfMonth(), value.hour(), value.minute()],
    value.second(),
    encodeFractionFromNanos(value.nano(), dateEncoding),
  );
}

function encodeLocalDateArray(value: JsJodaLocalDate): number[] {
  return [value.year(), value.monthValue(), value.dayOfMonth()];
}

function encodeLocalTimeArray(value: JsJodaLocalTime, dateEncoding: DateEncoding): number[] {
  return appendNumericTimeFields(
    [value.hour(), value.minute()],
    value.second(),
    encodeFractionFromNanos(value.nano(), dateEncoding),
  );
}

function encodeOffsetTimeArray(value: JsJodaOffsetTime, dateEncoding: DateEncoding): Array<number | string> {
  const local = encodeLocalTimeArray(value.toLocalTime(), dateEncoding);
  return [...local, value.offset().toString()];
}

function parseLocalDateTimeArray(
  value: number[],
  policy: SchemaPolicy,
  ctx: CodecContext,
): JsJodaLocalDateTime | typeof z.NEVER {
  if (value.length < 5 || value.length > 7) {
    return pushIssue(
      ctx,
      'LocalDateTime numeric timestamps must be ' +
        '[year,month,day,hour,minute,(second),(fraction)]',
      value
    );
  }
  try {
    const year = value[0];
    const month = value[1];
    const day = value[2];
    const hour = value[3];
    const minute = value[4];
    const second = value.length >= 6 ? value[5] : 0;
    const nanos = value.length === 7 ? decodeFractionToNanos(value[6], policy) : 0;
    return LocalDateTime.of(year, month, day, hour, minute, second, nanos);
  }
  catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : '';
    return pushIssue(
      ctx,
      `Invalid LocalDateTime numeric timestamp array${details}`,
      value,
    );
  }
}

function parseLocalDateArray(value: number[], ctx: CodecContext): JsJodaLocalDate | typeof z.NEVER {
  if (value.length !== 3) {
    return pushIssue(ctx, 'LocalDate numeric timestamps must be [year,month,day]', value);
  }
  try {
    return LocalDate.of(value[0], value[1], value[2]);
  }
  catch {
    return pushIssue(ctx, 'Invalid LocalDate numeric timestamp array', value);
  }
}

function parseLocalTimeArray(
  value: number[],
  policy: SchemaPolicy,
  ctx: CodecContext,
): JsJodaLocalTime | typeof z.NEVER {
  if (value.length < 2 || value.length > 4) {
    return pushIssue(ctx, 'LocalTime numeric timestamps must be [hour,minute,(second),(fraction)]', value);
  }
  try {
    const hour = value[0];
    const minute = value[1];
    const second = value.length >= 3 ? value[2] : 0;
    const nanos = value.length === 4 ? decodeFractionToNanos(value[3], policy) : 0;
    return LocalTime.of(hour, minute, second, nanos);
  }
  catch (error) {
    const details = error instanceof Error ? `: ${error.message}` : '';
    return pushIssue(
      ctx,
      `Invalid LocalTime numeric timestamp array${details}`,
      value,
    );
  }
}

function parseOffsetTimeArray(
  value: Array<number | string>,
  policy: SchemaPolicy,
  ctx: CodecContext,
): JsJodaOffsetTime | typeof z.NEVER {
  if (value.length < 3 || value.length > 5) {
    return pushIssue(ctx, 'OffsetTime numeric timestamps must be [hour,minute,(second),(fraction),offset]', value);
  }

  const offset = value.at(-1);
  if (typeof offset !== 'string') {
    return pushIssue(ctx, 'OffsetTime numeric timestamps must end with an offset string', value);
  }

  const timeParts = value.slice(0, -1);
  if (!timeParts.every((part): part is number => typeof part === 'number')) {
    return pushIssue(ctx, 'OffsetTime numeric timestamps must contain number time fields', value);
  }

  const localTime = parseLocalTimeArray(timeParts, policy, ctx);
  if (localTime === z.NEVER) {
    return z.NEVER;
  }

  try {
    return OffsetTime.of(localTime, ZoneOffset.of(offset));
  }
  catch {
    return pushIssue(ctx, 'Invalid OffsetTime offset', value);
  }
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

function decodeTaggedLocalDate(tagged: TaggedValue, ctx: CodecContext): TaggedLocalDateValue | typeof z.NEVER {
  if (tagged.tag !== epochDateTag) {
    ctx.issues.push({
      code: 'invalid_value',
      values: [epochDateTag],
      input: tagged.tag,
      message: 'Invalid CBOR tag for LocalDate decoding',
    });
    return z.NEVER;
  }
  if (typeof tagged.value !== 'number' || !Number.isInteger(tagged.value)) {
    return pushIssue(ctx, 'CBOR tag 100 must contain an integer epoch-day', tagged.value);
  }
  return { tag: epochDateTag, value: tagged.value };
}

function taggedTemporalEncoder<T, U = T>(
  dateEncoding: DateEncoding,
  iso: (value: U) => string,
  milliseconds: (value: T) => number,
  decimalSeconds: (value: T) => number,
  convert: (value: U) => T,
): (value: U) => string | number | TaggedValue {
  switch (dateEncoding) {
    case DateEncoding.ISO8601:
      return (value) => new TaggedValue(iso(value), isoDateTimeTag);
    case DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return (value) => milliseconds(convert(value));
    case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
      return (value) => new TaggedValue(decimalSeconds(convert(value)), epochDateTimeTag);
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
        encode: taggedTemporalEncoder<Instant>(
          policy.dateEncoding,
          (instant) => DateTimeFormatter.ISO_INSTANT.format(instant),
          (instant) => instant.toEpochMilli(),
          (instant) => secondsToNumber(instant.epochSecond(), instant.nano()),
          (instant) => instant,
        ),
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
              const instant = value.withZoneSameInstant(ZoneOffset.UTC).toInstant();
              return secondsToNumber(instant.epochSecond(), instant.nano());
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
          if (typeof value === 'number') {
            return ZonedDateTime.ofInstant(decodeInstantFromNumericPolicy(value, policy), ZoneId.UTC);
          }
          return parseIsoZonedDateTime(value, ctx);
        },
        encode: taggedTemporalEncoder<Instant, ZonedDateTime>(
          policy.dateEncoding,
          (zoned) => DateTimeFormatter.ISO_ZONED_DATE_TIME.format(zoned),
          (instant) => instant.toEpochMilli(),
          (instant) => secondsToNumber(instant.epochSecond(), instant.nano()),
          (zoned) => zoned.toInstant(),
        ),
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
              const instant = value.withOffsetSameInstant(ZoneOffset.UTC).toInstant();
              return secondsToNumber(instant.epochSecond(), instant.nano());
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
          if (typeof value === 'number') {
            return OffsetDateTime.ofInstant(decodeInstantFromNumericPolicy(value, policy), ZoneOffset.UTC);
          }
          return parseIsoOffsetDateTime(value, ctx);
        },
        encode: taggedTemporalEncoder<Instant, OffsetDateTime>(
          policy.dateEncoding,
          (offset) => DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(offset),
          (instant) => instant.toEpochMilli(),
          (instant) => secondsToNumber(instant.epochSecond(), instant.nano()),
          (offset) => offset.toInstant(),
        ),
      });
  }
}

function createOffsetTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaOffsetTime> {
  return z.codec(OFFSET_TIME_INPUT_SCHEMA, OFFSET_TIME_OUTPUT_SCHEMA, {
    decode: (value, ctx) => {
      if (typeof value === 'string') {
        return OffsetTime.parse(value, offsetTimeFormatter);
      }
      return parseOffsetTimeArray(value, policy, ctx);
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return offsetTimeFormatter.format(value);
      }
      return encodeOffsetTimeArray(value, policy.dateEncoding);
    },
  });
}

function createLocalDateTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalDateTime> {
  return z.codec(LOCAL_DATE_TIME_INPUT_SCHEMA, LOCAL_DATE_TIME_OUTPUT_SCHEMA, {
    decode: (value, ctx) => {
      if (typeof value === 'string') {
        return LocalDateTime.parse(value);
      }
      return parseLocalDateTimeArray(value, policy, ctx);
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(value);
      }
      // CBOR tag 100 (epoch-day) is accepted on decode for compatibility,
      // but the encoder always emits [year, month, day] to match Jackson's
      // array output.
      return encodeLocalDateTimeArray(value, policy.dateEncoding);
    },
  });
}

function createLocalDateSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalDate> {
  switch (policy.format) {
    case 'json':
      return z.codec(LOCAL_DATE_JSON_INPUT_SCHEMA, LOCAL_DATE_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return LocalDate.parse(value);
          }
          return parseLocalDateArray(value, ctx);
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
          }
          return encodeLocalDateArray(value);
        },
      });
    case 'cbor':
      return z.codec(LOCAL_DATE_CBOR_INPUT_SCHEMA, LOCAL_DATE_OUTPUT_SCHEMA, {
        decode: (value, ctx) => {
          if (typeof value === 'string') {
            return LocalDate.parse(value);
          }
          if (value instanceof TaggedValue) {
            const tagged = decodeTaggedLocalDate(value, ctx);
            if (tagged === z.NEVER) {
              return z.NEVER;
            }
            return LocalDate.ofEpochDay(tagged.value);
          }
          return parseLocalDateArray(value, ctx);
        },
        encode: (value) => {
          if (policy.dateEncoding === DateEncoding.ISO8601) {
            return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
          }
          return encodeLocalDateArray(value);
        },
      });
  }
}

function createLocalTimeSchema(policy: SchemaPolicy): z.ZodType<JsJodaLocalTime> {
  return z.codec(LOCAL_TIME_INPUT_SCHEMA, LOCAL_TIME_OUTPUT_SCHEMA, {
    decode: (value, ctx) => {
      if (typeof value === 'string') {
        return LocalTime.parse(value);
      }
      return parseLocalTimeArray(value, policy, ctx);
    },
    encode: (value) => {
      if (policy.dateEncoding === DateEncoding.ISO8601) {
        return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
      }
      return encodeLocalTimeArray(value, policy.dateEncoding);
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
              return value.getTime() / 1000;
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
        encode: taggedTemporalEncoder<Date>(
          policy.dateEncoding,
          (date) => date.toISOString(),
          (date) => date.getTime(),
          (date) => date.getTime() / 1000,
          (date) => date,
        ),
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
