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
} from '@js-joda/core';
import { JsonIncludeType, JsonStringifier } from '@outfoxx/jackson-js';
import { CustomMapper, Serializer } from '@outfoxx/jackson-js/dist/@types';
import 'reflect-metadata';
import { AnyType } from '../any-type';
import { Base64 } from '../util/base64';
import { encodeSeconds, secondsToNumber } from '../util/temporal';
import { StructuredMediaTypeEncoder } from './media-type-encoder';

export class JSONEncoder implements StructuredMediaTypeEncoder {
  static get default(): JSONEncoder {
    return new JSONEncoder(JSONEncoder.DateEncoding.ISO8601);
  }

  private readonly customSerializers: CustomMapper<Serializer>[];
  private stringifier = new JsonStringifier();

  constructor(readonly dateEncoding: JSONEncoder.DateEncoding) {
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

  encode<T>(value: T, type?: AnyType, includeNulls = false): string {
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

    return this.stringifier.stringify(value, {
      serializers: this.customSerializers,
      features: {
        serialization: {
          DEFAULT_PROPERTY_INCLUSION: {
            value: includeNulls
              ? JsonIncludeType.ALWAYS
              : JsonIncludeType.NON_NULL,
          },
        },
      },
      mainCreator: () => type ?? [Object],
    });
  }

  encodeObject<T>(
    value: T,
    type?: AnyType,
    includeNulls = false
  ): Record<string, unknown> {
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
      features: {
        serialization: {
          DEFAULT_PROPERTY_INCLUSION: {
            value: includeNulls
              ? JsonIncludeType.ALWAYS
              : JsonIncludeType.NON_NULL,
          },
        },
      },
      mainCreator: () => type ?? [Object],
    });
  }

  private instantSerializer: Serializer = (key: string, value: Instant) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case JSONEncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_INSTANT.format(value);
      case JSONEncoder.DateEncoding.MILLISECONDS:
        return value.toEpochMilli();
      case JSONEncoder.DateEncoding.FRACTIONAL_SECONDS:
        return secondsToNumber(value.epochSecond(), value.nano());
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
      case JSONEncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_ZONED_DATE_TIME.format(value);
      case JSONEncoder.DateEncoding.MILLISECONDS:
        return value.toInstant().toEpochMilli();
      case JSONEncoder.DateEncoding.FRACTIONAL_SECONDS:
        const instant = value.toInstant();
        return secondsToNumber(instant.epochSecond(), instant.nano());
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
      case JSONEncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(value);
      case JSONEncoder.DateEncoding.MILLISECONDS:
        return value.toInstant().toEpochMilli();
      case JSONEncoder.DateEncoding.FRACTIONAL_SECONDS:
        const instant = value.toInstant();
        return secondsToNumber(instant.epochSecond(), instant.nano());
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
      case JSONEncoder.DateEncoding.ISO8601:
        return this.offsetTimeFormatter.format(value);
      default:
        return [
          value.hour(),
          value.minute(),
          ...encodeSeconds(
            value.second(),
            this.dateEncoding == JSONEncoder.DateEncoding.MILLISECONDS
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
      case JSONEncoder.DateEncoding.ISO8601:
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
            this.dateEncoding == JSONEncoder.DateEncoding.MILLISECONDS
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
      case JSONEncoder.DateEncoding.ISO8601:
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
      case JSONEncoder.DateEncoding.ISO8601:
        return DateTimeFormatter.ISO_LOCAL_TIME.format(value);
      default:
        return [
          value.hour(),
          value.minute(),
          ...encodeSeconds(
            value.second(),
            this.dateEncoding == JSONEncoder.DateEncoding.MILLISECONDS
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
      case JSONEncoder.DateEncoding.ISO8601:
        return value.toISOString();
      case JSONEncoder.DateEncoding.MILLISECONDS:
        return value.getTime();
      case JSONEncoder.DateEncoding.FRACTIONAL_SECONDS:
        return value.getTime() / 1000.0;
    }
  };

  private urlSerializer: Serializer = (key: string, value: URL) => {
    if (value == null) {
      return null;
    }

    return value.toString();
  };

  private arrayBufferSerializer: Serializer = (
    key: string,
    value: ArrayBuffer
  ) => {
    if (value == null) {
      return null;
    }

    return Base64.encode(value);
  };
}

export namespace JSONEncoder {
  /**
   * Configures how temporal values are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode temporal values numerically using integer milliseconds.
     */
    FRACTIONAL_SECONDS,

    /**
     * Encode temporal values numerically using seconds with fractional
     * sub-second precision.
     */
    MILLISECONDS,

    /**
     * Encode temporal values values as an ISO-8601-formatted string (in
     * RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
