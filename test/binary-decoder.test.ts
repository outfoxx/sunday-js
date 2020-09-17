import fetchMock from 'jest-fetch-mock';
import { BinaryDecoder } from '../src/binary-decoder';

describe('BinaryDecoder', () => {
  it('disallows decoding to non-binary types (e.g. String)', async () => {
    fetchMock.mockResponseOnce('some data');
    await expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), [String])
    ).rejects.toThrow();
  });

  it('allows decoding to ArrayBuffer', async () => {
    fetchMock.mockResponseOnce('some data');
    await expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), [
        ArrayBuffer,
      ])
    ).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('allows decoding to Int8Array', async () => {
    fetchMock.mockResponseOnce('some data');
    await expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), [Int8Array])
    ).resolves.toBeInstanceOf(Int8Array);
  });

  it('allows decoding to Uint8Array', async () => {
    fetchMock.mockResponseOnce('some data');
    await expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), [
        Uint8Array,
      ])
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('allows decoding to DataView', async () => {
    fetchMock.mockResponseOnce('some data');
    await expect(
      new BinaryDecoder().decode(await fetch('http://example.com'), [DataView])
    ).resolves.toBeInstanceOf(DataView);
  });
});
