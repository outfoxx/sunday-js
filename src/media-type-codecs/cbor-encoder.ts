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
import { CBOR, TaggedValue } from '@outfoxx/cbor-redux';
import { JsonStringifier } from '@outfoxx/jackson-js';
import { CustomMapper, Serializer } from '@outfoxx/jackson-js/dist/@types';
import 'reflect-metadata';
import { AnyType } from '../any-type';
import { encodeSeconds, secondsToNumber } from '../util/temporal';
import { epochDateTimeTag, isoDateTimeTag, uriTag } from './cbor-tags';
import { MediaTypeEncoder } from './media-type-encoder';

export class CBOREncoder implements MediaTypeEncoder {
  static get default(): CBOREncoder {
    return new CBOREncoder(CBOREncoder.DateEncoding.FRACTIONAL_SECONDS);
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
        (value as any).constructor ?? {}
      )
    ) {
      type = [Object];
    }

    return this.stringifier.transform(value, {
      serializers: this.customSerializers,
      mainCreator: () => type ?? [Object],
    });
  }

  private instantSerializer: Serializer = (key: string, value: Instant) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
            value.atZone(ZoneId.UTC)
          ),
          isoDateTimeTag
        );
      case CBOREncoder.DateEncoding.MILLISECONDS:
        return new TaggedValue(value.toEpochMilli(), epochDateTimeTag);
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS:
        return new TaggedValue(
          secondsToNumber(value.epochSecond(), value.nano()),
          epochDateTimeTag
        );
    }
  };

  private zonedDateTimeSerializer: Serializer = (
    key: string,
    value: ZonedDateTime
  ) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value),
          isoDateTimeTag
        );
      case CBOREncoder.DateEncoding.MILLISECONDS:
        return new TaggedValue(
          value.toInstant().toEpochMilli(),
          epochDateTimeTag
        );
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS:
        const instant = value.toInstant();
        return new TaggedValue(
          secondsToNumber(instant.epochSecond(), instant.nano()),
          epochDateTimeTag
        );
    }
  };

  private offsetDateTimeSerializer: Serializer = (
    key: string,
    value: OffsetDateTime
  ) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(
          DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value),
          isoDateTimeTag
        );
      case CBOREncoder.DateEncoding.MILLISECONDS:
        return new TaggedValue(
          value.toInstant().toEpochMilli(),
          epochDateTimeTag
        );
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS:
        const instant = value.toInstant();
        return new TaggedValue(
          secondsToNumber(instant.epochSecond(), instant.nano()),
          epochDateTimeTag
        );
    }
  };

  private offsetTimeFormatter = new DateTimeFormatterBuilder()
    .parseCaseInsensitive()
    .append(DateTimeFormatter.ISO_LOCAL_TIME)
    .appendOffsetId()
    .toFormatter(ResolverStyle.STRICT);

  private offsetTimeSerializer: Serializer = (
    key: string,
    value: OffsetTime
  ) => {
    if (value == null) {
      return null;
    }
    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return this.offsetTimeFormatter.format(value);
      default:
        return [
          value.hour(),
          value.minute(),
          ...encodeSeconds(
            value.second(),
            this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS
              ? value.get(ChronoField.MILLI_OF_SECOND)
              : value.nano()
          ),
          value.offset().toString(),
        ];
    }
  };

  private localDateTimeSerializer: Serializer = (
    key: string,
    value: LocalDateTime
  ) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(value);
      default:
        return [
          value.year(),
          value.monthValue(),
          value.dayOfMonth(),
          value.hour(),
          value.minute(),
          ...encodeSeconds(
            value.second(),
            this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS
              ? value.get(ChronoField.MILLI_OF_SECOND)
              : value.nano()
          ),
        ];
    }
  };

  private localDateSerializer: Serializer = (key: string, value: LocalDate) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_LOCAL_DATE.format(value);
      default:
        return [value.year(), value.monthValue(), value.dayOfMonth()];
    }
  };

  private localTimeSerializer: Serializer = (key: string, value: LocalTime) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
      default:
        return [
          value.hour(),
          value.minute(),
          ...encodeSeconds(
            value.second(),
            this.dateEncoding == CBOREncoder.DateEncoding.MILLISECONDS
              ? value.get(ChronoField.MILLI_OF_SECOND)
              : value.nano()
          ),
        ];
    }
  };

  private dateSerializer: Serializer = (key: string, value: Date) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(value.toISOString(), isoDateTimeTag);
      case CBOREncoder.DateEncoding.MILLISECONDS:
        return new TaggedValue(value.getTime(), epochDateTimeTag);
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS:
        return new TaggedValue(value.getTime() / 1000.0, epochDateTimeTag);
    }
  };

  private urlSerializer: Serializer = (key: string, value: URL) => {
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
     * Encode temporal values numerically using seconds with fractional
     * sub-second precision.
     */
    FRACTIONAL_SECONDS,

    /**
     * Encode temporal values numerically using integer milliseconds.
     */
    MILLISECONDS,

    /**
     * Encode temporal values values as an ISO-8601-formatted string (in
     * RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
