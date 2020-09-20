import { CustomMapper, Serializer } from '@outfoxx/jackson-js/dist/@types';
import { DateTime } from 'luxon';
import { encode as b64encode } from './util/base64';
import { MediaTypeEncoder } from './media-type-encoder';
import { AnyType } from './any-type';
import { JsonStringifier } from '@outfoxx/jackson-js';

export class JSONEncoder implements MediaTypeEncoder {
  static get default() {
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

  encode<T>(value: T, type?: AnyType): string {
    return this.stringifier.stringify(value, {
      serializers: this.customSerializers,
      mainCreator: () => type ?? [Object],
    });
  }

  encodeJSON<T>(value: T, type?: AnyType): any {
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
      case JSONEncoder.DateEncoding.ISO8601:
        return value.toISO();
      case JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return value.toMillis();
      case JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH:
        return value.toSeconds();
    }
  };

  private dateSerializer: Serializer = (key: string, value: Date) => {
    if (value == null) {
      return null;
    }

    switch (this.dateEncoding) {
      case JSONEncoder.DateEncoding.ISO8601:
        return value.toISOString();
      case JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
        return value.getTime();
      case JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH:
        return value.getTime() / 1000;
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

    return b64encode(value);
  };
}

export namespace JSONEncoder {
  /**
   * Configures how `Date` & `DateTime` parameters are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode `Date`/`DateTime` values as a UNIX timestamp (floating point seconds since epoch).
     */
    SECONDS_SINCE_EPOCH,

    /**
     * Encode `Date`/`DateTime` values as UNIX millisecond timestamp (integer milliseconds since epoch).
     */
    MILLISECONDS_SINCE_EPOCH,

    /**
     * Encode `Date`/`DateTime` values as an ISO-8601-formatted string (in RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
