import { AnyType } from '../any-type';

export interface MediaTypeDecoder {
  decode<T>(response: Response, type: AnyType): Promise<T>;
}

export interface StructuredMediaTypeDecoder extends MediaTypeDecoder {
  decodeObject<T>(data: unknown, type: AnyType): T;
}

export function isStructuredMediaTypeDecoder(
  decoder: MediaTypeDecoder | StructuredMediaTypeDecoder | undefined
): decoder is StructuredMediaTypeDecoder {
  const rec = (decoder as unknown) as Record<string, unknown>;
  return !!rec.decodeJSON ?? false;
}
