import { MediaTypeDecoder } from './media-type-decoder';
import { AnyType } from './any-type';
import { ClassType } from '@outfoxx/jackson-js/dist/@types';

export class BinaryDecoder implements MediaTypeDecoder {
  static default = new BinaryDecoder();

  async decode<T>(response: Response, type: AnyType): Promise<T> {
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
