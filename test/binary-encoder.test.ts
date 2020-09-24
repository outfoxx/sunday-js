import { BinaryEncoder } from '../src';

describe('BinaryEncoder', () => {
  it('disallows encoding from non-binary types (e.g. String)', async () => {
    expect(() => new BinaryEncoder().encode('some text')).toThrow();
  });

  it('allows encoding from ArrayBuffer', async () => {
    expect(new BinaryEncoder().encode(new ArrayBuffer(10))).toBeInstanceOf(
      ArrayBuffer
    );
  });

  it('allows encoding from typed arrays', async () => {
    expect(
      new BinaryEncoder().encode(new Uint16Array([1, 2, 3, 4, 5]))
    ).toBeInstanceOf(Uint16Array);
  });
});
