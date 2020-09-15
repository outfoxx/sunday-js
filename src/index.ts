export * from './problem';
export * from './any-type';
export * from './request-manager';
export * from './fetch-request-manager';

export { nullifyNotFound } from './util/rxjs';

import { decode, encode, encodeSlice } from './util/base64';
export const Base64 = {
  decode,
  encode,
  encodeSlice,
};
