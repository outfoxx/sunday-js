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
  Duration,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  nativeJs,
  OffsetDateTime,
  OffsetTime,
  ResolverStyle,
  ZonedDateTime,
  ZoneId,
  ZoneOffset,
} from '@js-joda/core';
import { TaggedValue } from 'cbor-redux';
import { Base64 } from './util/base64';
import { secondsToNumber } from './util/temporal';
import { epochDateTimeTag, isoDateTimeTag, uriTag } from './media-type-codecs/cbor-tags';

export type SerdeFormat = 'json' | 'cbor';

export enum DateEncoding {
  DECIMAL_SECONDS_SINCE_EPOCH,
  MILLISECONDS_SINCE_EPOCH,
  ISO8601,
}

export enum NumericDateDecoding {
  DECIMAL_SECONDS_SINCE_EPOCH,
  MILLISECONDS_SINCE_EPOCH,
}

export interface SerializationContext {
  format: SerdeFormat;
  dateEncoding: DateEncoding;
  includeNulls: boolean;
}

export interface DeserializationContext {
  format: SerdeFormat;
  numericDateDecoding: NumericDateDecoding;
}

function decodeEpochSeconds(
  value: number,
  ctx: DeserializationContext,
): { seconds: number; nanos: number } {
  if (ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
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
  let seconds = Math.trunc(value);
  const fraction = value - seconds;
  // Round to microseconds to avoid floating precision drift from JSON/CBOR numbers.
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

function encodeLocalDateTimeNumber(
  value: LocalDateTime,
  dateEncoding: DateEncoding,
): number {
  const seconds = value.toEpochSecond(ZoneOffset.UTC);
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return seconds * 1000 + value.get(ChronoField.MILLI_OF_SECOND);
  }
  return secondsToNumber(seconds, value.nano());
}

function encodeLocalDateNumber(
  value: LocalDate,
  dateEncoding: DateEncoding,
): number {
  const seconds = value.atStartOfDay().toEpochSecond(ZoneOffset.UTC);
  return dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH
    ? seconds * 1000
    : secondsToNumber(seconds, 0);
}

function encodeLocalTimeNumber(
  value: LocalTime,
  dateEncoding: DateEncoding,
): number {
  const seconds = value.hour() * 3600 + value.minute() * 60 + value.second();
  if (dateEncoding === DateEncoding.MILLISECONDS_SINCE_EPOCH) {
    return seconds * 1000 + value.get(ChronoField.MILLI_OF_SECOND);
  }
  return secondsToNumber(seconds, value.nano());
}

function decodeLocalDateTimeNumber(
  value: number,
  ctx: DeserializationContext,
): LocalDateTime {
  const { seconds, nanos } = decodeEpochSeconds(value, ctx);
  return LocalDateTime.ofEpochSecond(seconds, nanos, ZoneOffset.UTC);
}

function decodeLocalTimeNumber(
  value: number,
  ctx: DeserializationContext,
): LocalTime {
  const { seconds, nanos } = decodeEpochSeconds(value, ctx);
  const secondsInDay = ((seconds % 86400) + 86400) % 86400;
  return LocalTime.ofNanoOfDay(secondsInDay * 1_000_000_000 + nanos);
}

export interface Serde<T> {
  serialize(value: T, ctx: SerializationContext): unknown;
  deserialize(value: unknown, ctx: DeserializationContext): T;
}

export const defaultSerializationContext: SerializationContext = {
  format: 'json',
  dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
  includeNulls: false,
};

export const defaultDeserializationContext: DeserializationContext = {
  format: 'json',
  numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
};

export function identitySerde<T>(): Serde<T> {
  return {
    serialize: (value: T) => value,
    deserialize: (value: unknown) => value as T,
  };
}

export const unknownSerde: Serde<unknown> = identitySerde();

export const anySerde: Serde<any> = identitySerde();

export const nullSerde: Serde<null> = {
  serialize: (value: null) => {
    if (value !== null) {
      throw new Error(`Invalid null value: ${String(value)}`);
    }
    return null;
  },
  deserialize: (value: unknown) => {
    if (value !== null) {
      throw new Error(`Invalid null value: ${String(value)}`);
    }
    return null;
  },
};

export const stringSerde: Serde<string> = {
  serialize: (value: string) => {
    if (typeof value !== 'string') {
      throw new Error(`Invalid string value: ${String(value)}`);
    }
    return value;
  },
  deserialize: (value: unknown) => {
    if (typeof value !== 'string') {
      throw new Error(`Invalid string value: ${String(value)}`);
    }
    return value;
  },
};

export const numberSerde: Serde<number> = {
  serialize: (value: number) => {
    if (typeof value !== 'number') {
      throw new Error(`Invalid number value: ${String(value)}`);
    }
    return value;
  },
  deserialize: (value: unknown) => {
    if (typeof value !== 'number') {
      throw new Error(`Invalid number value: ${String(value)}`);
    }
    return value;
  },
};

export const booleanSerde: Serde<boolean> = {
  serialize: (value: boolean) => {
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid boolean value: ${String(value)}`);
    }
    return value;
  },
  deserialize: (value: unknown) => {
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid boolean value: ${String(value)}`);
    }
    return value;
  },
};

export function enumSerde<T>(values: Record<string, T>): Serde<T> {
  const reverse = new Map<T, string>();
  Object.entries(values).forEach(([key, value]) => reverse.set(value, key));

  return {
    serialize: (value: T) => {
      const key = reverse.get(value);
      if (key == null) {
        throw new Error(`Invalid enum value: ${String(value)}`);
      }
      return key;
    },
    deserialize: (value: unknown) => {
      if (typeof value !== 'string') {
        throw new Error(`Invalid enum value: ${String(value)}`);
      }
      const mapped = values[value];
      if (mapped == null) {
        throw new Error(`Unknown enum value: ${value}`);
      }
      return mapped;
    },
  };
}

export function arraySerde<T>(elementSerde: Serde<T>): Serde<Array<T>> {
  return {
    serialize: (value, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error(`Invalid array value: ${String(value)}`);
      }
      return value.map((entry) => elementSerde.serialize(entry, ctx));
    },
    deserialize: (value, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error(`Invalid array value: ${String(value)}`);
      }
      return value.map((entry) => elementSerde.deserialize(entry, ctx));
    },
  };
}

export function setSerde<T>(elementSerde: Serde<T>): Serde<Set<T>> {
  return {
    serialize: (value, ctx) => {
      if (value instanceof Set) {
        return Array.from(value).map((entry) => elementSerde.serialize(entry, ctx));
      } else {
        throw new Error(`Invalid set value: ${String(value)}`);
      }
    },
    deserialize: (value, ctx) => {
      if (!Array.isArray(value)) {
        throw new Error(`Invalid set value: ${String(value)}`);
      }
      return new Set(value.map((entry) => elementSerde.deserialize(entry, ctx)));
    },
  };
}

export function mapSerde<T>(valueSerde: Serde<T>): Serde<Record<string, T>> {
  return {
    serialize: (value, ctx) => {
      const record = expectObject(value, 'Record');
      const result: Record<string, unknown> = {};
      Object.entries(record).forEach(([key, entry]) => {
        result[key] = valueSerde.serialize(entry as T, ctx);
      });
      return result;
    },
    deserialize: (value, ctx) => {
      const record = expectObject(value, 'Record');
      const result: Record<string, T> = {};
      Object.entries(record).forEach(([key, entry]) => {
        result[key] = valueSerde.deserialize(entry, ctx);
      });
      return result;
    },
  };
}

export function optionalSerde<T>(serde: Serde<T>): Serde<T | undefined> {
  return {
    serialize: (value, ctx) => {
      if (value === undefined) {
        return undefined;
      }
      return serde.serialize(value, ctx);
    },
    deserialize: (value, ctx) => {
      if (value === undefined) {
        return undefined;
      }
      return serde.deserialize(value, ctx);
    },
  };
}

export function nullableSerde<T>(serde: Serde<T>): Serde<T | null> {
  return {
    serialize: (value, ctx) => {
      if (value === null) {
        return null;
      }
      return serde.serialize(value, ctx);
    },
    deserialize: (value, ctx) => {
      if (value === null) {
        return null;
      }
      return serde.deserialize(value, ctx);
    },
  };
}

export interface UnionVariant<T> {
  check: (value: unknown) => boolean;
  serde: Serde<T>;
}

export function unionSerde<T>(variants: Array<UnionVariant<unknown>>, label: string): Serde<T> {
  return {
    serialize: (value, ctx) => {
      const found = variants.find((variant) => variant.check(value));
      if (!found) {
        throw new Error(`Unsupported union value for ${label}: ${String(value)}`);
      }
      return found.serde.serialize(value as never, ctx);
    },
    deserialize: (value, ctx) => {
      const found = variants.find((variant) => variant.check(value));
      if (!found) {
        throw new Error(`Unsupported union value for ${label}: ${String(value)}`);
      }
      return found.serde.deserialize(value, ctx) as T;
    },
  };
}

export function errorUnionSerde<T>(label: string): Serde<T> {
  return {
    serialize: (value) => value as unknown,
    deserialize: () => {
      throw new Error(`Cannot deserialize non-discriminated union ${label}`);
    },
  };
}

export function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid object value for ${label}`);
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, label: string): Array<unknown> {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid array value for ${label}`);
  }
  return value;
}

export function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid string value for ${label}`);
  }
  return value;
}

export function expectNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`Invalid number value for ${label}`);
  }
  return value;
}

export function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid boolean value for ${label}`);
  }
  return value;
}

export function serializeRequired<T>(
  target: Record<string, unknown>,
  key: string,
  value: T,
  serde: Serde<T>,
  ctx: SerializationContext,
  nullable = false,
): void {
  if (value === undefined) {
    throw new Error(`Missing required value for ${key}`);
  }
  if (value === null) {
    if (!nullable) {
      throw new Error(`Null is not allowed for ${key}`);
    }
    if (!ctx.includeNulls) {
      return;
    }
    target[key] = null;
    return;
  }
  const serialized = serde.serialize(value, ctx);
  if (serialized === null && !ctx.includeNulls) {
    return;
  }
  target[key] = serialized;
}

export function serializeOptional<T>(
  target: Record<string, unknown>,
  key: string,
  value: T | undefined,
  serde: Serde<T>,
  ctx: SerializationContext,
  nullable = false,
): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    if (!nullable) {
      throw new Error(`Null is not allowed for ${key}`);
    }
    if (!ctx.includeNulls) {
      return;
    }
    target[key] = null;
    return;
  }
  const serialized = serde.serialize(value, ctx);
  if (serialized === null && !ctx.includeNulls) {
    return;
  }
  target[key] = serialized;
}

export function deserializeRequired<T>(
  source: Record<string, unknown>,
  key: string,
  serde: Serde<T>,
  ctx: DeserializationContext,
  nullable = false,
): T {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    throw new Error(`Missing required property ${key}`);
  }
  const value = source[key];
  if (value === null) {
    if (!nullable) {
      throw new Error(`Null is not allowed for ${key}`);
    }
    return null as unknown as T;
  }
  return serde.deserialize(value, ctx);
}

export function deserializeOptional<T>(
  source: Record<string, unknown>,
  key: string,
  serde: Serde<T>,
  ctx: DeserializationContext,
  nullable = false,
): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    return undefined;
  }
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    if (!nullable) {
      throw new Error(`Null is not allowed for ${key}`);
    }
    return null as unknown as T;
  }
  return serde.deserialize(value, ctx);
}

export interface DiscriminatorVariant<T> {
  serde: Serde<T>;
  ctor?: () => new (...args: never[]) => T;
  isType?: (value: unknown) => boolean;
}

export interface DiscriminatorRegistry<T> {
  serialize(value: T, ctx: SerializationContext): Record<string, unknown>;
  serializeExternal(value: T, ctx: SerializationContext): Record<string, unknown>;
  deserialize(value: unknown, ctx: DeserializationContext): T;
  deserializeWithExternal(value: unknown, discriminator: string, ctx: DeserializationContext): T;
  discriminatorFor(value: T): string;
}

export function createDiscriminatorRegistry<T>(
  property: string,
  variants: Record<string, DiscriminatorVariant<T>>,
  options?: { external?: boolean },
): DiscriminatorRegistry<T> {
  const external = options?.external ?? false;

  const findVariant = (value: T): [string, DiscriminatorVariant<T>] => {
    for (const [disc, variant] of Object.entries(variants)) {
      if (variant.isType && variant.isType(value)) {
        return [disc, variant];
      }
      const ctor = variant.ctor?.();
      if (ctor && value instanceof ctor) {
        return [disc, variant];
      }
    }

    if (value && typeof value === 'object') {
      const current = (value as Record<string, unknown>)[property];
      if (typeof current === 'string' && variants[current]) {
        return [current, variants[current]];
      }
    }

    throw new Error(`Unknown discriminator for ${property}`);
  };

  const serializeValue = (value: T, ctx: SerializationContext, includeProperty: boolean): Record<string, unknown> => {
    const [disc, variant] = findVariant(value);
    const serialized = variant.serde.serialize(value, ctx);
    const obj = expectObject(serialized, property);
    if (includeProperty) {
      obj[property] = disc;
    }
    return obj;
  };

  return {
    serialize(value, ctx) {
      return serializeValue(value, ctx, !external);
    },
    serializeExternal(value, ctx) {
      return serializeValue(value, ctx, false);
    },
    deserialize(value, ctx) {
      const obj = expectObject(value, property);
      const disc = obj[property];
      if (typeof disc !== 'string') {
        throw new Error(`Missing discriminator ${property}`);
      }
      const variant = variants[disc];
      if (!variant) {
        throw new Error(`Unknown discriminator value ${disc}`);
      }
      return variant.serde.deserialize(value, ctx);
    },
    deserializeWithExternal(value, discriminator, ctx) {
      const variant = variants[discriminator];
      if (!variant) {
        throw new Error(`Unknown discriminator value ${discriminator}`);
      }
      return variant.serde.deserialize(value, ctx);
    },
    discriminatorFor(value: T) {
      return findVariant(value)[0];
    },
  };
}

export function serializeDiscriminated<T>(
  registry: DiscriminatorRegistry<T>,
  value: T,
  ctx: SerializationContext,
): Record<string, unknown> {
  return registry.serialize(value, ctx);
}

export function deserializeDiscriminated<T>(
  registry: DiscriminatorRegistry<T>,
  value: unknown,
  ctx: DeserializationContext,
): T {
  return registry.deserialize(value, ctx);
}

const offsetTimeFormatter = new DateTimeFormatterBuilder()
  .parseCaseInsensitive()
  .append(DateTimeFormatter.ISO_LOCAL_TIME)
  .appendOffsetId()
  .toFormatter(ResolverStyle.STRICT);

export const urlSerde: Serde<URL> = {
  serialize: (value, ctx) => {
    if (!(value instanceof URL)) {
      throw new Error(`Invalid URL value: ${String(value)}`);
    }
    if (ctx.format === 'cbor') {
      return new TaggedValue(value.toString(), uriTag);
    }
    return value.toString();
  },
  deserialize: (value, ctx) => {
    if (ctx.format === 'cbor') {
      if (value instanceof TaggedValue && value.tag === uriTag && typeof value.value === 'string') {
        return new URL(value.value);
      }
    }
    if (typeof value === 'string') {
      return new URL(value);
    }
    if (value instanceof URL) {
      return value;
    }
    throw new Error(`Invalid URL value: ${String(value)}`);
  },
};

export const arrayBufferSerde: Serde<ArrayBuffer> = {
  serialize: (value, ctx) => {
    if (!(value instanceof ArrayBuffer)) {
      throw new Error(`Invalid ArrayBuffer value: ${String(value)}`);
    }
    if (ctx.format === 'json') {
      return Base64.encode(value);
    }
    return value;
  },
  deserialize: (value, ctx) => {
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (ctx.format === 'cbor' && ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      }
      const copy = new Uint8Array(value.byteLength);
      copy.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return copy.buffer;
    }
    if (ctx.format === 'json' && typeof value === 'string') {
      return Base64.decode(value);
    }
    if (ctx.format === 'cbor' && typeof value === 'string') {
      return Base64.decode(value);
    }
    throw new Error(`Invalid ArrayBuffer value: ${String(value)}`);
  },
};

export const instantSerde: Serde<Instant> = {
  serialize: (value, ctx) => {
    if (!(value instanceof Instant)) {
      throw new Error(`Invalid Instant value: ${String(value)}`);
    }
    switch (ctx.dateEncoding) {
      case DateEncoding.ISO8601:
        return ctx.format === 'cbor'
          ? new TaggedValue(DateTimeFormatter.ISO_INSTANT.format(value), isoDateTimeTag)
          : DateTimeFormatter.ISO_INSTANT.format(value);
      case DateEncoding.MILLISECONDS_SINCE_EPOCH: {
        const val = value.toEpochMilli();
        return ctx.format === 'cbor' ? new TaggedValue(val, epochDateTimeTag) : val;
      }
      case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
        const val = secondsToNumber(value.epochSecond(), value.nano());
        return ctx.format === 'cbor' ? new TaggedValue(val, epochDateTimeTag) : val;
      }
    }
  },
  deserialize: (value, ctx) => {
    if (value instanceof Instant) {
      return value;
    }
    if (value instanceof Date) {
      return Instant.from(nativeJs(value));
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      if (value.tag === isoDateTimeTag && typeof value.value === 'string') {
        return Instant.from(DateTimeFormatter.ISO_INSTANT.parse(value.value));
      }
      if (value.tag === epochDateTimeTag && typeof value.value === 'number') {
        return ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ? Instant.ofEpochMilli(value.value)
          : Instant.ofEpochSecond(
              Duration.parse(`PT${value.value}S`).seconds(),
              Duration.parse(`PT${value.value}S`).nano(),
            );
      }
    }
    if (typeof value === 'number') {
      if (ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH) {
        return Instant.ofEpochMilli(value);
      }
      const duration = Duration.parse(`PT${value}S`);
      return Instant.ofEpochSecond(duration.seconds(), duration.nano());
    }
    if (typeof value === 'string') {
      return Instant.from(DateTimeFormatter.ISO_INSTANT.parse(value));
    }
    throw new Error('Invalid Instant value');
  },
};

export const zonedDateTimeSerde: Serde<ZonedDateTime> = {
  serialize: (value, ctx) => {
    if (!(value instanceof ZonedDateTime)) {
      throw new Error(`Invalid ZonedDateTime value: ${String(value)}`);
    }
    switch (ctx.dateEncoding) {
      case DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_ZONED_DATE_TIME.format(value);
      case DateEncoding.MILLISECONDS_SINCE_EPOCH: {
        return [
          encodeLocalDateTimeNumber(value.toLocalDateTime(), ctx.dateEncoding),
          value.offset().toString(),
          value.zone().id(),
        ];
      }
      case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
        return [
          encodeLocalDateTimeNumber(value.toLocalDateTime(), ctx.dateEncoding),
          value.offset().toString(),
          value.zone().id(),
        ];
      }
    }
  },
  deserialize: (value, ctx) => {
    if (value instanceof ZonedDateTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.from(nativeJs(value));
      return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      if (value.tag === isoDateTimeTag && typeof value.value === 'string') {
        return ZonedDateTime.from(DateTimeFormatter.ISO_ZONED_DATE_TIME.parse(value.value));
      }
      if (value.tag === epochDateTimeTag && typeof value.value === 'number') {
        const instant =
          ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
            ? Instant.ofEpochMilli(value.value)
            : (() => {
                const duration = Duration.parse(`PT${value.value}S`);
                return Instant.ofEpochSecond(duration.seconds(), duration.nano());
              })();
        return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
      }
    }
    if (typeof value === 'number') {
      const instant =
        ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ? Instant.ofEpochMilli(value)
          : (() => {
              const duration = Duration.parse(`PT${value}S`);
              return Instant.ofEpochSecond(duration.seconds(), duration.nano());
            })();
      return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
    }
    if (Array.isArray(value)) {
      if (value.length < 2) {
        throw Error('Invalid zoned date time value');
      }
      const [localNumber, offset, zoneId] = value as [
        number,
        string,
        string | undefined,
      ];
      const localDateTime = decodeLocalDateTimeNumber(localNumber, ctx);
      const zoneOffset = ZoneOffset.of(offset);
      const zone = ZoneId.of(zoneId ?? offset);
      return ZonedDateTime.ofLocal(localDateTime, zone, zoneOffset);
    }
    if (typeof value === 'string') {
      return ZonedDateTime.from(DateTimeFormatter.ISO_ZONED_DATE_TIME.parse(value));
    }
    throw new Error('Invalid ZonedDateTime value');
  },
};

export const offsetDateTimeSerde: Serde<OffsetDateTime> = {
  serialize: (value, ctx) => {
    if (!(value instanceof OffsetDateTime)) {
      throw new Error(`Invalid OffsetDateTime value: ${String(value)}`);
    }
    switch (ctx.dateEncoding) {
      case DateEncoding.ISO8601:
        return ctx.format === 'cbor'
          ? new TaggedValue(DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value), isoDateTimeTag)
          : DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value);
      case DateEncoding.MILLISECONDS_SINCE_EPOCH: {
        return [
          encodeLocalDateTimeNumber(value.toLocalDateTime(), ctx.dateEncoding),
          value.offset().toString(),
        ];
      }
      case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
        return [
          encodeLocalDateTimeNumber(value.toLocalDateTime(), ctx.dateEncoding),
          value.offset().toString(),
        ];
      }
    }
  },
  deserialize: (value, ctx) => {
    if (value instanceof OffsetDateTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.from(nativeJs(value));
      return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      if (value.tag === isoDateTimeTag && typeof value.value === 'string') {
        return OffsetDateTime.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(value.value));
      }
      if (value.tag === epochDateTimeTag && typeof value.value === 'number') {
        const instant =
          ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
            ? Instant.ofEpochMilli(value.value)
            : (() => {
                const duration = Duration.parse(`PT${value.value}S`);
                return Instant.ofEpochSecond(duration.seconds(), duration.nano());
              })();
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
      }
    }
    if (typeof value === 'number') {
      const instant =
        ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ? Instant.ofEpochMilli(value)
          : (() => {
              const duration = Duration.parse(`PT${value}S`);
              return Instant.ofEpochSecond(duration.seconds(), duration.nano());
            })();
      return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
    if (Array.isArray(value)) {
      if (value.length < 2) {
        throw Error('Invalid offset date time value');
      }
      const [localNumber, offset] = value as [number, string];
      const localDateTime = decodeLocalDateTimeNumber(localNumber, ctx);
      return OffsetDateTime.of(localDateTime, ZoneOffset.of(offset));
    }
    if (typeof value === 'string') {
      return OffsetDateTime.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(value));
    }
    throw new Error('Invalid OffsetDateTime value');
  },
};

export const offsetTimeSerde: Serde<OffsetTime> = {
  serialize: (value, ctx) => {
    if (!(value instanceof OffsetTime)) {
      throw new Error(`Invalid OffsetTime value: ${String(value)}`);
    }
    if (ctx.dateEncoding === DateEncoding.ISO8601) {
      return offsetTimeFormatter.format(value);
    }
    return [
      encodeLocalTimeNumber(value.toLocalTime(), ctx.dateEncoding),
      value.offset().toString(),
    ];
  },
  deserialize: (value, ctx) => {
    if (value instanceof OffsetTime) {
      return value;
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      return offsetTimeSerde.deserialize(value.value, { ...ctx, format: 'json' });
    }
    if (typeof value === 'number') {
      const time = decodeLocalTimeNumber(value, ctx);
      return OffsetTime.of(time, ZoneOffset.UTC);
    }
    if (Array.isArray(value)) {
      if (value.length < 2) {
        throw Error('Invalid offset time value');
      }
      if (value.length === 2) {
        const [localNumber, offset] = value as [number, string];
        const time = decodeLocalTimeNumber(localNumber, ctx);
        return OffsetTime.of(time, ZoneOffset.of(offset));
      }
      const [hours, minutes, seconds, nanos, offset] = value as [
        number,
        number,
        number,
        number | undefined,
        string | undefined,
      ];
      return OffsetTime.of(
        hours,
        minutes,
        seconds,
        nanos ?? 0,
        ZoneOffset.of(offset ?? 'Z'),
      );
    }
    if (typeof value === 'string') {
      return OffsetTime.parse(value);
    }
    throw new Error('Invalid OffsetTime value');
  },
};

export const localDateTimeSerde: Serde<LocalDateTime> = {
  serialize: (value, ctx) => {
    if (!(value instanceof LocalDateTime)) {
      throw new Error(`Invalid LocalDateTime value: ${String(value)}`);
    }
    if (ctx.dateEncoding === DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(value);
    }
    return encodeLocalDateTimeNumber(value, ctx.dateEncoding);
  },
  deserialize: (value, ctx) => {
    if (value instanceof LocalDateTime) {
      return value;
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      return localDateTimeSerde.deserialize(value.value, { ...ctx, format: 'json' });
    }
    if (typeof value === 'number') {
      return decodeLocalDateTimeNumber(value, ctx);
    }
    if (Array.isArray(value)) {
      if (value.length < 3) {
        throw Error('Invalid local date time value');
      }
      const [year, month, day, hour, minute, second, nanos] = value as [
        number,
        number,
        number,
        number | undefined,
        number | undefined,
        number | undefined,
        number | undefined,
      ];
      return LocalDateTime.of(
        year,
        month,
        day,
        hour ?? 0,
        minute ?? 0,
        second ?? 0,
        nanos ?? 0,
      );
    }
    if (typeof value === 'string') {
      return LocalDateTime.parse(value);
    }
    throw new Error('Invalid LocalDateTime value');
  },
};

export const localDateSerde: Serde<LocalDate> = {
  serialize: (value, ctx) => {
    if (!(value instanceof LocalDate)) {
      throw new Error(`Invalid LocalDate value: ${String(value)}`);
    }
    if (ctx.dateEncoding === DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
    }
    return encodeLocalDateNumber(value, ctx.dateEncoding);
  },
  deserialize: (value, ctx) => {
    if (value instanceof LocalDate) {
      return value;
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      return localDateSerde.deserialize(value.value, { ...ctx, format: 'json' });
    }
    if (typeof value === 'number') {
      const { seconds } = decodeEpochSeconds(value, ctx);
      return LocalDate.ofEpochDay(Math.floor(seconds / 86400));
    }
    if (typeof value === 'string') {
      return LocalDate.parse(value);
    }
    throw new Error('Invalid LocalDate value');
  },
};

export const localTimeSerde: Serde<LocalTime> = {
  serialize: (value, ctx) => {
    if (!(value instanceof LocalTime)) {
      throw new Error(`Invalid LocalTime value: ${String(value)}`);
    }
    if (ctx.dateEncoding === DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
    }
    return encodeLocalTimeNumber(value, ctx.dateEncoding);
  },
  deserialize: (value, ctx) => {
    if (value instanceof LocalTime) {
      return value;
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      return localTimeSerde.deserialize(value.value, { ...ctx, format: 'json' });
    }
    if (typeof value === 'number') {
      return decodeLocalTimeNumber(value, ctx);
    }
    if (Array.isArray(value)) {
      if (value.length < 2) {
        throw Error('Invalid local time value');
      }
      const [hours, minutes, seconds, nanos] = value as [
        number,
        number,
        number | undefined,
        number | undefined,
      ];
      return LocalTime.of(hours, minutes, seconds ?? 0, nanos ?? 0);
    }
    if (typeof value === 'string') {
      return LocalTime.parse(value);
    }
    throw new Error('Invalid LocalTime value');
  },
};

export const dateSerde: Serde<Date> = {
  serialize: (value, ctx) => {
    if (!(value instanceof Date)) {
      throw new Error(`Invalid Date value: ${String(value)}`);
    }
    switch (ctx.dateEncoding) {
      case DateEncoding.ISO8601:
        return ctx.format === 'cbor'
          ? new TaggedValue(value.toISOString(), isoDateTimeTag)
          : value.toISOString();
      case DateEncoding.MILLISECONDS_SINCE_EPOCH: {
        const val = value.getTime();
        return ctx.format === 'cbor' ? new TaggedValue(val, epochDateTimeTag) : val;
      }
      case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH: {
        const val = value.getTime() / 1000.0;
        return ctx.format === 'cbor' ? new TaggedValue(val, epochDateTimeTag) : val;
      }
    }
  },
  deserialize: (value, ctx) => {
    if (value instanceof Date) {
      return value;
    }
    if (ctx.format === 'cbor' && value instanceof TaggedValue) {
      return dateSerde.deserialize(value.value, { ...ctx, format: 'json' });
    }
    if (typeof value === 'number') {
      return ctx.numericDateDecoding === NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
        ? new Date(value)
        : new Date(value * 1000.0);
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Invalid Date value');
  },
};
