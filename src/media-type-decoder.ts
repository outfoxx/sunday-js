import { AnyType } from './any-type';

export interface MediaTypeDecoder {
  decode<T>(response: Response, type: AnyType): Promise<T>;
}
