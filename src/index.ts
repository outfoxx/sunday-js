export * from './problem';
export * from './any-type';
export * from './class-type';
export * from './request-factory';
export * from './fetch-request-factory';
export * from './url-template';

export { nullifyNotFound } from './util/rxjs';

import { decode, encode, encodeSlice } from './util/base64';

export const Base64 = {
  decode,
  encode,
  encodeSlice,
};
