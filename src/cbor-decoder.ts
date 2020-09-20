import { CBOR } from '@outfoxx/cbor-redux';
import { JsonParser } from '@outfoxx/jackson-js';
import { AnyType } from './any-type';
import { epochDateTag, isoDateTag, uriTag } from './cbor-tags';
import { MediaTypeDecoder } from './media-type-decoder';

export class CBORDecoder implements MediaTypeDecoder {
  static get default() {
    return new CBORDecoder();
  }

  private readonly parser = new JsonParser();

  async decode<T>(response: Response, type: AnyType): Promise<T> {
    return this.decodeData(await response.arrayBuffer(), type);
  }

  decodeData<T>(buffer: ArrayBuffer, type: AnyType): Promise<T> {
    return this.parser.transform(CBOR.decode(buffer, CBORDecoder.untag), {
      mainCreator: () => type,
    });
  }

  private static untag = (value: any, tag: number) => {
    switch (tag) {
      case isoDateTag:
        if (typeof value !== 'string') {
          throw Error('Invalid iso date value');
        }
        return new Date(value);
      case epochDateTag:
        if (typeof value !== 'number') {
          throw Error('Invalid epoch date value');
        }
        return new Date(value * 1000);
      case uriTag:
        if (typeof value !== 'string') {
          throw Error('Invalid URI value');
        }
        return new URL(value);
      default:
        return value;
    }
  };
}
