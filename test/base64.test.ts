import { Base64 } from '../src';

describe('Base64', () => {
  it('decodes with new lines', () => {
    const decoded = Base64.decode(
      `MDEyMzQ1Njc4OT\n AxMjM0NTY3O\nDkwMTIzNDU2Nzg5MD\n  EyMzQ1Njc4OT\nAxMjM0NTY3ODkwMTIzNDU2Nzg5MD\nEyMzQ1Njc4OTAxMjM0NTY3ODk=`
    );
    // prettier-ignore
    expect(Array.from(new Uint8Array(decoded)))
      .toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ].map(value => value + 48));
  });
});
