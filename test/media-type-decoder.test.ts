import {
  BinaryDecoder,
  isStructuredMediaTypeDecoder,
  JSONDecoder,
} from '../src';

describe('MediaTypeDecoder', () => {
  describe('type guards', () => {
    it('correctly identifies StructuredMediaTypeDecoder(s)', () => {
      expect(isStructuredMediaTypeDecoder(JSONDecoder.default)).toBe(true);
    });

    it('correctly identifies non-StructuredMediaTypeDecoder(s)', () => {
      expect(isStructuredMediaTypeDecoder(BinaryDecoder.default)).toBe(false);
    });
  });
});
