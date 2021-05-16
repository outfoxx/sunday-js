import {
  isStructuredMediaTypeEncoder,
  isURLQueryParamsEncoder,
  JSONEncoder,
  WWWFormUrlEncoder,
} from '../src';

describe('MediaTypeEncoder', () => {
  describe('type guards', () => {
    it('correctly identifies URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(WWWFormUrlEncoder.default)).toBe(true);
    });

    it('correctly identifies non-URLQueryParamsEncoder(s)', () => {
      expect(isURLQueryParamsEncoder(JSONEncoder.default)).toBe(false);
    });

    it('correctly identifies StructuredMediaTypeEncoder(s)', () => {
      expect(isStructuredMediaTypeEncoder(JSONEncoder.default)).toBe(true);
    });

    it('correctly identifies non-StructuredMediaTypeEncoder(s)', () => {
      expect(isStructuredMediaTypeEncoder(WWWFormUrlEncoder.default)).toBe(
        false
      );
    });
  });
});
