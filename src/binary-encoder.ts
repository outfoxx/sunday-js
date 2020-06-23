import { MediaTypeEncoder } from './media-type-encoder';

export class BinaryEncoder implements MediaTypeEncoder {
  static default = new BinaryEncoder();

  encode(value: unknown): BufferSource {
    if (!ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) {
      throw Error('Invalid value, expected BufferSource');
    }
    return value;
  }
}
