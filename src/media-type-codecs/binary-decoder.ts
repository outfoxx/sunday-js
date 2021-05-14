import { MediaTypeDecoder } from './media-type-decoder';
import { AnyConstructableType } from '../any-type';

export class BinaryDecoder implements MediaTypeDecoder {
  static default = new BinaryDecoder();

  async decode<T>(response: Response, type: AnyConstructableType): Promise<T> {
    const arrayBuffer = await response.arrayBuffer();

    if (type[0] === ArrayBuffer) {
      return (arrayBuffer as unknown) as T;
    } else if (
      type[0] === Uint8Array ||
      type[0] === Int8Array ||
      type[0] === DataView
    ) {
      return new type[0](arrayBuffer) as T;
    }

    throw Error(
      'Invalid value, expected ArrayBuffer, (Int|Uint)Array or DataView'
    );
  }
}
