import { CBORDecoder } from '../src/cbor-decoder';
import { CBOREncoder } from '../src/cbor-encoder';

describe('CBOREncoder', () => {
  describe('encode', () => {
    it('encodes to ArrayBuffer', () => {
      const initial = { x: new Date(), y: 'test' };
      const encoded = CBOREncoder.default.encode(initial);
      const decoded = CBORDecoder.default.decodeData(encoded, [Object]);
      expect(decoded).toStrictEqual(initial);
    });
  });
});
