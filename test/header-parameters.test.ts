import { HeaderParameters } from '../src/header-parameters';

describe('HeaderParameters', () => {
  it('encodes array values as repeated headers', () => {
    const headers = HeaderParameters.encode({ test: ['a', 'b'] });

    expect(headers).toEqual([
      ['test', 'a'],
      ['test', 'b'],
    ]);
  });

  it('encodes string values', () => {
    const headers = HeaderParameters.encode({ test: 'tester' });

    expect(headers).toEqual([['test', 'tester']]);
  });

  it('encodes integer values', () => {
    const headers = HeaderParameters.encode({ test: 123 });

    expect(headers).toEqual([['test', '123']]);
  });

  it('encodes decimal values', () => {
    const headers = HeaderParameters.encode({ test: 123.456 });

    expect(headers).toEqual([['test', '123.456']]);
  });

  it('ignores null values', () => {
    const headers = HeaderParameters.encode({ test: null });

    expect(headers).toEqual([]);
  });

  it('ignores undefined values', () => {
    const headers = HeaderParameters.encode({ test: undefined });

    expect(headers).toEqual([]);
  });

  it('ignores nested null values', () => {
    const headers = HeaderParameters.encode({ test: [null] });

    expect(headers).toEqual([]);
  });

  it('ignores nested undefined values', () => {
    const headers = HeaderParameters.encode({ test: [undefined] });

    expect(headers).toEqual([]);
  });

  it('fails when encoded value contains invalid characters', () => {
    expect(() => HeaderParameters.encode({ test: 'a\nb' })).toThrow();
    expect(() => HeaderParameters.encode({ test: 'a\rb' })).toThrow();
    expect(() => HeaderParameters.encode({ test: 'a\u1234b' })).toThrow();
  });
});
