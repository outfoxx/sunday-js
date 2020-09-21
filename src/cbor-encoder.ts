import { CBOR, TaggedValue } from '@outfoxx/cbor-redux';
import { JsonStringifier } from '@outfoxx/jackson-js';
import { CustomMapper, Serializer } from '@outfoxx/jackson-js/dist/@types';
import { DateTime } from 'luxon';
import { AnyType } from './any-type';
import { epochDateTag, isoDateTag, uriTag } from './cbor-tags';
import { MediaTypeEncoder } from './media-type-encoder';

export class CBOREncoder implements MediaTypeEncoder {
  static get default() {
    return new CBOREncoder(CBOREncoder.DateEncoding.SECONDS_SINCE_EPOCH);
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
        type: () => DateTime,
        mapper: this.dateTimeSerializer,
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

  private encodeJSON<T>(value: T, type?: AnyType): any {
    return this.stringifier.transform(value, {
      serializers: this.customSerializers,
      mainCreator: () => type ?? [Object],
    });
  }

  private dateTimeSerializer: Serializer = (key: string, value: DateTime) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(value.toISO(), isoDateTag);
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS_SINCE_EPOCH:
        return new TaggedValue(value.toMillis() / 1000.0, epochDateTag);
      case CBOREncoder.DateEncoding.SECONDS_SINCE_EPOCH:
        return new TaggedValue(value.toSeconds(), epochDateTag);
    }
  };

  private dateSerializer: Serializer = (key: string, value: Date) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case CBOREncoder.DateEncoding.ISO8601:
        return new TaggedValue(value.toISOString(), isoDateTag);
      case CBOREncoder.DateEncoding.FRACTIONAL_SECONDS_SINCE_EPOCH:
        return new TaggedValue(value.getTime() / 1000.0, epochDateTag);
      case CBOREncoder.DateEncoding.SECONDS_SINCE_EPOCH:
        return new TaggedValue(
          Math.trunc(value.getTime() / 1000.0),
          epochDateTag
        );
    }
  };

  private urlSerializer: Serializer = (key: string, value: URL) => {
    if (value == null) {
      return null;
    }

    return new TaggedValue(value.toString(), uriTag);
  };

  private arrayBufferSerializer: Serializer = (
    key: string,
    value: ArrayBuffer
  ) => {
    return value;
  };
}

export namespace CBOREncoder {
  /**
   * Configures how `Date` & `DateTime` parameters are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode `Date`/`DateTime` values as a UNIX timestamp (floating point seconds since epoch).
     */
    SECONDS_SINCE_EPOCH = 'int',

    /**
     * Encode `Date`/`DateTime` values as UNIX millisecond timestamp (integer milliseconds since epoch).
     */
    FRACTIONAL_SECONDS_SINCE_EPOCH = 'float',

    /**
     * Encode `Date`/`DateTime` values as an ISO-8601-formatted string (in RFC 3339 format). This is the default behavior.
     */
    ISO8601 = 'string',
  }
}
