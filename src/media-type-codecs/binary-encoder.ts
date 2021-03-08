import { MediaTypeEncoder } from './media-type-encoder';

export class BinaryEncoder implements MediaTypeEncoder {
  static default = new BinaryEncoder();

  encode(value: unknown): BodyInit {
    if (
      !ArrayBuffer.isView(value) &&
      !(value instanceof ArrayBuffer) &&
      !(value instanceof Blob) &&
      !(value instanceof ReadableStream)
    ) {
      throw Error(
        'Invalid value, expected BufferSource, Blob or ReadableStream'
      );
    }
    return value;
  }
}
