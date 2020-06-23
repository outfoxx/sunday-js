import { AnyType } from './any-type';

export interface MediaTypeEncoder {
  encode<T = unknown>(value: T, type: AnyType | undefined): BodyInit;
}

export interface URLQueryParamsEncoder extends MediaTypeEncoder {
  encodeQueryString(value: Record<string, unknown>): string;
}

export function isURLQueryParamsEncoder(
  encoder: MediaTypeEncoder | URLQueryParamsEncoder | undefined
): encoder is URLQueryParamsEncoder {
  const rec = (encoder as unknown) as Record<string, unknown>;
  return !!rec.encodeQueryString ?? false;
}
