import { isURLQueryParamsEncoder, JSONEncoder, URLEncoder } from '../src';

describe('MediaTypeEncoder', () => {
  describe('type guards', () => {
    it('correctly identifies URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(URLEncoder.default)).toBe(true);
    });
    it('correctly identifies non-URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(JSONEncoder.default)).toBe(false);
    });
  });
});
