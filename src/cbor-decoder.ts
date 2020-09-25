import { CBOR } from '@outfoxx/cbor-redux';
import { JsonParser } from '@outfoxx/jackson-js';
import { CustomMapper, Deserializer } from '@outfoxx/jackson-js/dist/@types';
import { AnyType } from './any-type';
import { epochDateTag, isoDateTag, uriTag } from './cbor-tags';
import { DateTime } from './date-time-types';
import { MediaTypeDecoder } from './media-type-decoder';
import { Base64 } from './util/base64';

export class CBORDecoder implements MediaTypeDecoder {
  static get default(): CBORDecoder {
    return new CBORDecoder();
  }

  private readonly customDeserializers: CustomMapper<Deserializer>[];
  private readonly parser = new JsonParser();

  constructor() {
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
    return this.decodeData(await response.arrayBuffer(), type);
  }

  decodeData<T>(buffer: ArrayBuffer, type: AnyType): T {
    return this.parser.transform(CBOR.decode(buffer, CBORDecoder.untag), {
      deserializers: this.customDeserializers,
      mainCreator: () => type,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static untag = (value: any, tag: number) => {
    switch (tag) {
      case isoDateTag:
        if (typeof value !== 'string') {
          throw Error('Invalid iso date value');
        }
        return DateTime.fromISO(value, { setZone: true });
      case epochDateTag:
        if (typeof value !== 'number') {
          throw Error('Invalid epoch date value');
        }
        return DateTime.fromSeconds(value, { zone: 'UTC' });
      case uriTag:
        if (typeof value !== 'string') {
          throw Error('Invalid URI value');
        }
        return new URL(value);
      default:
        return value;
    }
  };

  private dateTimeDeserializer: Deserializer = (
    key: string,
    value: unknown
  ) => {
    if (value == null) {
      return value;
    }
    if (DateTime.isDateTime(value)) {
      return value;
    }
    if (value instanceof Date) {
      return DateTime.fromJSDate(value, { zone: 'UTC' });
    }
    if (typeof value === 'number') {
      return DateTime.fromSeconds(value, { zone: 'UTC' });
    }
    if (typeof value === 'string') {
      return DateTime.fromISO(value, { setZone: true });
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
    if (DateTime.isDateTime(value)) {
      return value.toJSDate();
    }
    if (typeof value === 'number') {
      return new Date(value * 1000);
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
    value: unknown
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
        value.byteOffset + value.byteLength
      );
    }
    if (typeof value === 'string') {
      return Base64.decode(value);
    }
    throw Error(`Invalid ArrayBuffer value for property ${key}`);
  };
}
