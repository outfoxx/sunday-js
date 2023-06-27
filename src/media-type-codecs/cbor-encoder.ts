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
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  ResolverStyle,
  ZonedDateTime,
  ZoneId,
} from '@js-joda/core';
import { CBOR, TaggedValue } from 'cbor-redux';
import { JsonStringifier } from '@outfoxx/jackson-js';
import { CustomMapper, Serializer } from '@outfoxx/jackson-js/dist/@types';
import 'reflect-metadata';
import { AnyType } from '../any-type';
import { encodeSeconds, secondsToNumber } from '../util/temporal';
import { epochDateTimeTag, isoDateTimeTag, uriTag } from './cbor-tags';
import { MediaTypeEncoder } from './media-type-encoder';

export class CBOREncoder implements MediaTypeEncoder {
  static get default(): CBOREncoder {
    return new CBOREncoder(
      CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
    );
  }

  private readonly customSerializers: CustomMapper<Serializer>[];
  private stringifier = new JsonStringifier();

  constructor(readonly dateEncoding: CBOREncoder.DateEncoding) {
    this.customSerializers = [
      {
        type: () => Date,
        mapper: this.dateSerializer,
      },
      {
        type: () => Instant,
        mapper: this.instantSerializer,
      },
      {
        type: () => ZonedDateTime,
        mapper: this.zonedDateTimeSerializer,
      },
      {
        type: () => OffsetDateTime,
        mapper: this.offsetDateTimeSerializer,
      },
      {
        type: () => OffsetTime,
        mapper: this.offsetTimeSerializer,
      },
      {
        type: () => LocalDateTime,
        mapper: this.localDateTimeSerializer,
      },
      {
        type: () => LocalDate,
        mapper: this.localDateSerializer,
      },
      {
        type: () => LocalTime,
        mapper: this.localTimeSerializer,
      },
      {
        type: () => URL,
        mapper: this.urlSerializer,
      },
      {
        type: () => ArrayBuffer,
        mapper: this.arrayBufferSerializer,
      },
    ];
  }

  encode<T>(value: T, type?: AnyType): ArrayBuffer {
    return CBOR.encode(this.encodeJSON(value, type));
  }

  private encodeJSON<T>(value: T, type?: AnyType): unknown {
    // Use natural type when subtypes exist
    if (
      Reflect.hasMetadata(
        'jackson:defaultContextGroup:JsonSubTypes',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (value as any).constructor ?? {},
      )
    ) {
      type = [Object];
    }

    return this.stringifier.transform(value, {
      serializers: this.customSerializers,
      mainCreator: () => type ?? [Object],
    });
  }

  private arrayBufferSerializer: Serializer = (_, value: ArrayBuffer) => {
    return value;
  };

  private instantSerializer: Serializer = (_, value: Instant) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
            value.atZone(ZoneId.UTC),
          ),
          isoDateTimeTag,
        );
      case CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return new TaggedValue(value.toEpochMilli(), epochDateTimeTag);
      case CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
        return new TaggedValue(
          secondsToNumber(value.epochSecond(), value.nano()),
          epochDateTimeTag,
        );
    }
  };

  private zonedDateTimeSerializer: Serializer = (_, value: ZonedDateTime) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value),
          isoDateTimeTag,
        );
      case CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return new TaggedValue(
          value.toInstant().toEpochMilli(),
          epochDateTimeTag,
        );
      case CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
        const instant = value.toInstant();
        return new TaggedValue(
          secondsToNumber(instant.epochSecond(), instant.nano()),
          epochDateTimeTag,
        );
    }
  };

  private offsetDateTimeSerializer: Serializer = (_, value: OffsetDateTime) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value),
          isoDateTimeTag,
        );
      case CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return new TaggedValue(
          value.toInstant().toEpochMilli(),
          epochDateTimeTag,
        );
      case CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
        const instant = value.toInstant();
        return new TaggedValue(
          secondsToNumber(instant.epochSecond(), instant.nano()),
          epochDateTimeTag,
        );
    }
  };

  private offsetTimeFormatter = new DateTimeFormatterBuilder()
    .parseCaseInsensitive()
    .append(DateTimeFormatter.ISO_LOCAL_TIME)
    .appendOffsetId()
    .toFormatter(ResolverStyle.STRICT);

  private offsetTimeSerializer: Serializer = (_, value: OffsetTime) => {
    if (value == null) {
      return null;
    }
    if (this.dateEncoding == CBOREncoder.DateEncoding.ISO8601) {
      return this.offsetTimeFormatter.format(value);
    } else {
      return [
        value.hour(),
        value.minute(),
        ...encodeSeconds(
          value.second(),
          this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
            ? value.get(ChronoField.MILLI_OF_SECOND)
            : value.nano(),
        ),
        value.offset().toString(),
      ];
    }
  };

  private localDateTimeSerializer: Serializer = (_, value: LocalDateTime) => {
    if (value == null) {
      return null;
    }

    if (this.dateEncoding == CBOREncoder.DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(value);
    } else {
      return [
        value.year(),
        value.monthValue(),
        value.dayOfMonth(),
        value.hour(),
        value.minute(),
        ...encodeSeconds(
          value.second(),
          this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
            ? value.get(ChronoField.MILLI_OF_SECOND)
            : value.nano(),
        ),
      ];
    }
  };

  private localDateSerializer: Serializer = (_, value: LocalDate) => {
    if (value == null) {
      return null;
    }

    if (this.dateEncoding == CBOREncoder.DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
    } else {
      return [value.year(), value.monthValue(), value.dayOfMonth()];
    }
  };

  private localTimeSerializer: Serializer = (_, value: LocalTime) => {
    if (value == null) {
      return null;
    }

    if (this.dateEncoding == CBOREncoder.DateEncoding.ISO8601) {
      return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
    } else {
      return [
        value.hour(),
        value.minute(),
        ...encodeSeconds(
          value.second(),
          this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
            ? value.get(ChronoField.MILLI_OF_SECOND)
            : value.nano(),
        ),
      ];
    }
  };

  private dateSerializer: Serializer = (_, value: Date) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(value.toISOString(), isoDateTimeTag);
      case CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return new TaggedValue(value.getTime(), epochDateTimeTag);
      case CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
        return new TaggedValue(value.getTime() / 1000.0, epochDateTimeTag);
    }
  };

  private urlSerializer: Serializer = (_, value: URL) => {
    if (value == null) {
      return null;
    }

    return new TaggedValue(value.toString(), uriTag);
  };
}

export namespace CBOREncoder {
  /**
   * Configures how temporal values are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode temporal values numerically using seconds with decimal
     * sub-second precision.
     */
    DECIMAL_SECONDS_SINCE_EPOCH,

    /**
     * Encode temporal values numerically using integer milliseconds.
     */
    MILLISECONDS_SINCE_EPOCH,

    /**
     * Encode temporal values as an ISO-8601-formatted string (in
     * RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
