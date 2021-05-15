import {
  isURLQueryParamsEncoder,
  isStructuredMediaTypeEncoder,
  JSONEncoder,
  URLEncoder,
} from '../src';

describe('MediaTypeEncoder', () => {
  describe('type guards', () => {
    it('correctly identifies URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(URLEncoder.default)).toBe(true);
    });

    it('correctly identifies non-URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(JSONEncoder.default)).toBe(false);
    });

    it('correctly identifies StructuredMediaTypeEncoder(s)', () => {
      expect(isStructuredMediaTypeEncoder(JSONEncoder.default)).toBe(true);
    });

    it('correctly identifies non-StructuredMediaTypeEncoder(s)', () => {
      expect(isStructuredMediaTypeEncoder(URLEncoder.default)).toBe(false);
    });
  });
});
