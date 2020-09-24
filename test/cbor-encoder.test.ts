import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { DateTime } from 'luxon';
import { CBOREncoder } from '../src/cbor-encoder';
import { Hex } from '../src/util/hex';

describe('CBOREncoder', () => {
  it('encodes jackson-js object trees', () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number
      ) {}
    }

    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub
      ) {}
    }

    expect(
      CBOREncoder.default.encode(new Test('a', new Sub(5)), [Test])
    ).toHaveBytes(
      Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05')
    );
  });

  it('encodes URL values as URL (tagged string)', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL
      ) {}
    }

    expect(
      CBOREncoder.default.encode(new Test(new URL('http://example.com')), [
        Test,
      ])
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 D8 20 73 687474703A2F2F6578616D706C652E636F6D2F'
      )
    );
  });

  it('encodes DateTime values as ISO date (tagged string)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(
          DateTime.fromISO('2001-02-03T04:05:06.789Z', { setZone: true })
        ),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
      )
    );
  });

  it('encodes DateTime values as epoch date (tagged float)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.SECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromSeconds(981173106.789)), [Test])
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });

  it('encodes Date values as ISO date (tagged string)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(
          DateTime.fromISO('2001-02-03T04:05:06.789Z', {
            setZone: true,
          }).toJSDate()
        ),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
      )
    );
  });

  it('encodes Date values as epoch date (tagged float)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.SECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromSeconds(981173106.789).toJSDate()), [Test])
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });
});
