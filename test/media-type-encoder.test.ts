import { JSONEncoder } from '../src/json-encoder';
import { isURLQueryParamsEncoder } from '../src/media-type-encoder';
import { URLEncoder } from '../src/url-encoder';



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
