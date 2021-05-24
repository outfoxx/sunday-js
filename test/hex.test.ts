import { Hex } from '../src';

describe('Hex', () => {
  it('encodes/decodes roundtrip', () => {
    const source = `AFC9E7835F33419AD46E669BB6D6`;
    const decoded = Hex.decode(source);
    const encoded = Hex.encode(decoded).toUpperCase();
    expect(encoded).toEqual(source);
  });

  it('decode does not accept invalid hex strings', () => {
    const source = `AFC9E7835F33419AD46E669BB6D66`;
    expect(() => Hex.decode(source)).toThrowError();
  });
});
