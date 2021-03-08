import { AnyType } from '../any-type';
import { MediaTypeEncoder } from './media-type-encoder';

export interface MediaTypeDecoder {
  decode<T>(response: Response, type: AnyType): Promise<T>;
}

export interface StructuredMediaTypeDecoder extends MediaTypeEncoder {
  decodeJSON<T>(
    data: unknown,
    type?: AnyType,
    includeNulls?: boolean
  ): Promise<T>;
}

export function isStructuredMediaTypeDecoder(
  decoder: MediaTypeEncoder | StructuredMediaTypeDecoder | undefined
): decoder is StructuredMediaTypeDecoder {
  const rec = (decoder as unknown) as Record<string, unknown>;
  return !!rec.decodeJSON ?? false;
}
