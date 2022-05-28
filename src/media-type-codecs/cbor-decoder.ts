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
import { CBOR } from '@outfoxx/cbor-redux';
import { JsonParser } from '@outfoxx/jackson-js';
import { CustomMapper, Deserializer } from '@outfoxx/jackson-js/dist/@types';
import { AnyType } from '../any-type';
import { Base64 } from '../util/base64';
import { epochDateTimeTag, isoDateTimeTag, uriTag } from './cbor-tags';
import { MediaTypeDecoder } from './media-type-decoder';

export class CBORDecoder implements MediaTypeDecoder {
  static get default(): CBORDecoder {
    return new CBORDecoder(
      CBORDecoder.NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
    );
  }

  private readonly customDeserializers: CustomMapper<Deserializer>[];
  private readonly parser = new JsonParser();

  constructor(readonly numericDateDecoding: CBORDecoder.NumericDateDecoding) {
    this.customDeserializers = [
      {
        type: () => Date,
        mapper: this.dateDeserializer,
      },
      {
        type: () => Instant,
        mapper: this.instantDeserializer,
      },
      {
        type: () => ZonedDateTime,
        mapper: this.zonedDateTimeDeserializer,
      },
      {
        type: () => OffsetDateTime,
        mapper: this.offsetDateTimeDeserializer,
      },
      {
        type: () => OffsetTime,
        mapper: this.offsetTimeDeserializer,
      },
      {
        type: () => LocalDateTime,
        mapper: this.localDateTimeDeserializer,
      },
      {
        type: () => LocalDate,
        mapper: this.localDateDeserializer,
      },
      {
        type: () => LocalTime,
        mapper: this.localTimeDeserializer,
      },
      {
        type: () => URL,
        mapper: this.urlDeserializer,
      },
      {
        type: () => ArrayBuffer,
        mapper: this.arrayBufferDeserializer,
      },
    ];
  }

  async decode<T>(response: Response, type: AnyType): Promise<T> {
    return this.decodeData(await response.arrayBuffer(), type);
  }

  decodeData<T>(buffer: ArrayBuffer, type: AnyType): T {
    return this.parser.transform(CBOR.decode(buffer, this.untag), {
      deserializers: this.customDeserializers,
      mainCreator: () => type,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private untag = (value: any, tag: number) => {
    switch (tag) {
      case isoDateTimeTag:
        if (typeof value !== 'string') {
          throw Error('Invalid iso date value');
        }
        return ZonedDateTime.parse(value);
      case epochDateTimeTag:
        if (typeof value !== 'number') {
          throw Error('Invalid epoch date value');
        }
        if (
          this.numericDateDecoding ==
          CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
        ) {
          return Instant.ofEpochMilli(value);
        } else {
          const duration = Duration.parse(`PT${value}S`);
          return Instant.ofEpochSecond(duration.seconds(), duration.nano());
        }
      case uriTag:
        if (typeof value !== 'string') {
          throw Error('Invalid URI value');
        }
        return new URL(value);
      default:
        return value;
    }
  };

  private instantDeserializer: Deserializer = (key: string, value: unknown) => {
    if (value == null) {
      return value;
    }
    if (value instanceof Instant) {
      return value;
    }
    if (value instanceof ZonedDateTime) {
      return value.toInstant();
    }
    if (value instanceof Date) {
      return Instant.from(nativeJs(value));
    }
    if (typeof value === 'number') {
      if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        return Instant.ofEpochMilli(value);
      } else if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ) {
        const duration = Duration.parse(`PT${value}S`);
        return Instant.ofEpochSecond(duration.seconds(), duration.nano());
      } else {
        throw Error('Unsupported date decoding format');
      }
    }
    if (typeof value === 'string') {
      return Instant.from(DateTimeFormatter.ISO_INSTANT.parse(value));
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private zonedDateTimeDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof Instant) {
      return value.atZone(ZoneId.UTC);
    }
    if (value instanceof ZonedDateTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.from(nativeJs(value));
      return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
    }
    if (typeof value === 'number') {
      if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        const instant = Instant.ofEpochMilli(value);
        return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
      } else if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ) {
        const duration = Duration.parse(`PT${value}S`);
        const instant = Instant.ofEpochSecond(
          duration.seconds(),
          duration.nano(),
        );
        return ZonedDateTime.ofInstant(instant, ZoneId.UTC);
      } else {
        console.error('Unsupported date decoding format');
      }
    }
    if (typeof value === 'string') {
      return ZonedDateTime.from(
        DateTimeFormatter.ISO_ZONED_DATE_TIME.parse(value),
      );
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private offsetDateTimeDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof Instant) {
      return value.atZone(ZoneId.UTC).toOffsetDateTime();
    }
    if (value instanceof ZonedDateTime) {
      return value.toOffsetDateTime();
    }
    if (value instanceof OffsetDateTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.from(nativeJs(value));
      return OffsetDateTime.ofInstant(instant, ZoneId.UTC);
    }
    if (typeof value === 'number') {
      if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        const instant = Instant.ofEpochMilli(value);
        return OffsetDateTime.ofInstant(instant, ZoneId.UTC);
      } else if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ) {
        const duration = Duration.parse(`PT${value}S`);
        const instant = Instant.ofEpochSecond(
          duration.seconds(),
          duration.nano(),
        );
        return OffsetDateTime.ofInstant(instant, ZoneId.UTC);
      } else {
        console.error('Unsupported date decoding format');
      }
    }
    if (typeof value === 'string') {
      return OffsetDateTime.from(
        DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse(value),
      );
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private offsetTimeFormatter = new DateTimeFormatterBuilder()
    .parseCaseInsensitive()
    .append(DateTimeFormatter.ISO_LOCAL_TIME)
    .appendOffsetId()
    .toFormatter(ResolverStyle.STRICT);

  private offsetTimeDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof OffsetTime) {
      return value;
    }
    if (value instanceof Array) {
      let idx = 0;
      const hour = value[idx++] as number;
      const minute = value[idx++] as number;
      let second = 0;
      let nanoOfSecond = 0;
      if (value.length > 3) {
        second = value[idx++];
        if (value.length > 4) {
          nanoOfSecond = value[idx++];
          if (
            this.numericDateDecoding ==
            CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ) {
            // millis to nanos
            nanoOfSecond *= 1_000_000;
          }
        }
      }
      const offset = value[idx++] as string;
      return OffsetTime.of(
        hour,
        minute,
        second,
        nanoOfSecond,
        ZoneOffset.of(offset),
      );
    }
    if (typeof value === 'string') {
      return OffsetTime.from(this.offsetTimeFormatter.parse(value));
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private localDateTimeDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof LocalDateTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.ofEpochMilli(value.getTime());
      return LocalDateTime.ofInstant(instant, ZoneId.UTC);
    }
    if (value instanceof Array) {
      let idx = 0;
      const year = value[idx++];
      const month = value[idx++];
      const day = value[idx++];
      const hour = value[idx++];
      const minute = value[idx++];
      let second = 0;
      let nanoOfSecond = 0;
      if (value.length > 5) {
        second = value[idx++];
        if (value.length > 6) {
          nanoOfSecond = value[idx++];
          if (
            this.numericDateDecoding ==
            CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ) {
            // millis to nanos
            nanoOfSecond *= 1_000_000;
          }
        }
      }
      return LocalDateTime.of(
        year,
        month,
        day,
        hour,
        minute,
        second,
        nanoOfSecond,
      );
    }
    if (typeof value === 'string') {
      return LocalDateTime.from(
        DateTimeFormatter.ISO_LOCAL_DATE_TIME.parse(value),
      );
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private localDateDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof LocalDate) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.ofEpochMilli(value.getTime());
      return LocalDate.ofInstant(instant, ZoneId.UTC);
    }
    if (value instanceof Array) {
      const year = value[0];
      const month = value[1];
      const day = value[2];
      return LocalDate.of(year, month, day);
    }
    if (typeof value === 'number') {
      return LocalDate.ofEpochDay(value);
    }
    if (typeof value === 'string') {
      return LocalDate.from(DateTimeFormatter.ISO_LOCAL_DATE.parse(value));
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private localTimeDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof LocalTime) {
      return value;
    }
    if (value instanceof Date) {
      const instant = Instant.ofEpochMilli(value.getTime());
      return LocalTime.ofInstant(instant, ZoneId.UTC);
    }
    if (value instanceof Array) {
      let idx = 0;
      const hour = value[idx++];
      const minute = value[idx++];
      let second = 0;
      let nanoOfSecond = 0;
      if (value.length > 2) {
        second = value[idx++];
        if (value.length > 3) {
          nanoOfSecond = value[idx++];
          if (
            this.numericDateDecoding ==
            CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
          ) {
            // millis to nanos
            nanoOfSecond *= 1_000_000;
          }
        }
      }
      return LocalTime.of(hour, minute, second, nanoOfSecond);
    }
    if (typeof value === 'number') {
      return LocalTime.ofNanoOfDay(value);
    }
    if (typeof value === 'string') {
      return LocalTime.from(DateTimeFormatter.ISO_LOCAL_TIME.parse(value));
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private dateDeserializer: Deserializer = (key: string, value: unknown) => {
    if (value == null) {
      return value;
    }
    if (value instanceof Date) {
      return value;
    }
    if (value instanceof Instant) {
      return new Date(value.toEpochMilli());
    }
    if (value instanceof ZonedDateTime) {
      return new Date(value.toInstant().toEpochMilli());
    }
    if (typeof value === 'number') {
      if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        return new Date(value);
      } else if (
        this.numericDateDecoding ===
        CBORDecoder.NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ) {
        return new Date(value * 1000);
      } else {
        console.error('Unsupported date decoding format');
      }
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private urlDeserializer: Deserializer = (key: string, value: unknown) => {
    if (value == null) {
      return value;
    }
    if (value instanceof URL) {
      return value;
    }
    if (typeof value === 'string') {
      return new URL(value);
    }
    throw Error(`Invalid URL value for property ${key}`);
  };

  private arrayBufferDeserializer: Deserializer = (
    key: string,
    value: unknown,
  ) => {
    if (value == null) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength,
      );
    }
    if (typeof value === 'string') {
      return Base64.decode(value);
    }
    throw Error(`Invalid ArrayBuffer value for property ${key}`);
  };
}

export namespace CBORDecoder {
  /**
   * Configures how numeric temporal values are decoded.
   */
  export enum NumericDateDecoding {
    /**
     * Decode numeric temporal values assuming they are seconds with decimal
     * sub-second precision.
     */
    DECIMAL_SECONDS_SINCE_EPOCH,

    /**
     * Decode numeric temporal values assuming they are integer milliseconds.
     */
    MILLISECONDS_SINCE_EPOCH,
  }
}
