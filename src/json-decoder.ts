import { decode as b64decode } from './util/base64';
import { JsonParser } from '@outfoxx/jackson-js';
import { CustomMapper, Deserializer } from '@outfoxx/jackson-js/dist/@types';
import { DateTime } from 'luxon';
import { AnyType } from './any-type';
import { MediaTypeDecoder } from './media-type-decoder';

export class JSONDecoder implements MediaTypeDecoder {
  static get default() {
    return new JSONDecoder(
      JSONDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
    );
  }

  private readonly customDeserializers: CustomMapper<Deserializer>[];
  private readonly parser = new JsonParser();

  constructor(readonly numericDateEncoding: JSONDecoder.NumericDateDecoding) {
    this.customDeserializers = [
      {
        type: () => Date,
        mapper: this.dateDeserializer,
      },
      {
        type: () => DateTime,
        mapper: this.dateTimeDeserializer,
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
    return this.parser.transform(await response.json(), {
      deserializers: this.customDeserializers,
      mainCreator: () => type,
    });
  }

  decodeText<T>(text: string, type: AnyType): T {
    return this.parser.parse(text, {
      deserializers: this.customDeserializers,
      mainCreator: () => type,
    }) as T;
  }

  private dateTimeDeserializer: Deserializer = (key: string, value: any) => {
    if (DateTime.isDateTime(value)) {
      return value;
    }
    if (value instanceof Date) {
      return DateTime.fromJSDate(value);
    }
    if (typeof value === 'number') {
      if (
        this.numericDateEncoding ===
        JSONDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        return DateTime.fromMillis(value);
      } else if (
        this.numericDateEncoding ===
        JSONDecoder.NumericDateDecoding.SECONDS_SINCE_EPOCH
      ) {
        return DateTime.fromSeconds(value);
      } else {
        console.error('Unsupported date decoding format');
      }
    }
    if (typeof value === 'string') {
      return DateTime.fromISO(value);
    }
    throw new Error(`Invalid date value for property ${key}`);
  };

  private dateDeserializer: Deserializer = (key: string, value: any) => {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'number') {
      if (
        this.numericDateEncoding ===
        JSONDecoder.NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
      ) {
        return new Date(value);
      } else if (
        this.numericDateEncoding ===
        JSONDecoder.NumericDateDecoding.SECONDS_SINCE_EPOCH
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

  private urlDeserializer: Deserializer = (key: string, value: any) => {
    if (value == null) {
      return null;
    }
    if (value instanceof URL) {
      return value;
    }
    if (typeof value === 'string') {
      return new URL(value);
    }
    throw Error(`Invalid URL value for property ${key}`);
  };

  private arrayBufferDeserializer: Deserializer = (key: string, value: any) => {
    if (value == null) {
      return null;
    }
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (typeof value === 'string') {
      return b64decode(value);
    }
    throw Error(`Invalid ArrayBuffer value for property ${key}`);
  };
}

export namespace JSONDecoder {
  /**
   * Configures how numeric `Date` & `DateTime` parameters are decoded.
   */
  export enum NumericDateDecoding {
    /**
     * Decode the `Date`/`DateTime` as a UNIX timestamp (floating point seconds since epoch).
     */
    SECONDS_SINCE_EPOCH,

    /**
     * Decode the `Date`/`DateTime` as UNIX millisecond timestamp (integer milliseconds since epoch).
     */
    MILLISECONDS_SINCE_EPOCH,
  }
}
