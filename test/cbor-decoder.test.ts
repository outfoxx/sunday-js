import fetchMock from 'fetch-mock';
import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { DateTime } from 'luxon';
import { CBORDecoder } from '../src/cbor-decoder';
import { Hex } from '../src/util/hex';

describe('CBORDecoder', () => {
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });
  beforeEach(() => {
    fetchMock.reset();
  });

  it('decodes jackson-js types from fetch response', async () => {
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

    fetchMock.getOnce(
      'http://example.com',
      new Response(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05')
      )
    );
    await expectAsync(
      CBORDecoder.default.decode(await fetch('http://example.com'), [Test])
    ).toBeResolvedTo(new Test('a', new Sub(5)));
  });

  it('decodes jackson-js types from string', async () => {
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

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
        [Test]
      )
    ).toEqual(new Test('a', new Sub(5)));
  });

  it('decodes URL values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 73 687474703A2F2F6578616D706C652E636F6D2F'),
        [Test]
      )
    ).toEqual(new Test(new URL('http://example.com')));
  });

  it('decodes URL values from tagged URL', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 D8 20 72 687474703A2F2F6578616D706C652E636F6D'
        ),
        [Test]
      )
    ).toEqual(new Test(new URL('http://example.com')));
  });

  it('decodes DateTime values from ISO string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A'
        ),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromISO('2002-01-01T01:02:03.004Z', { setZone: true }))
    );
  });

  it('decodes DateTime values from ISO date', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A'
        ),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromISO('2002-01-01T01:02:03.004Z', { setZone: true }))
    );
  });

  it('decodes DateTime values from epoch seconds number', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromISO('2001-02-03T04:05:06.789Z', { setZone: true }))
    );
  });

  it('decodes DateTime values from epoch seconds date', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromISO('2001-02-03T04:05:06.789Z', { setZone: true }))
    );
  });

  it('decodes Date values from ISO string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030312D30322D30335430343A30353A30362E3738395A'
        ),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromSeconds(981173106.789, { zone: 'UTC' }).toJSDate())
    );
  });

  it('decodes Date values from ISO date', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
        ),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromSeconds(981173106.789, { zone: 'UTC' }).toJSDate())
    );
  });

  it('decodes Date values from epoch seconds number', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromSeconds(981173106.789, { zone: 'UTC' }).toJSDate())
    );
  });

  it('decodes Date values from epoch seconds date', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        [Test]
      )
    ).toEqual(
      new Test(DateTime.fromSeconds(981173106.789, { zone: 'UTC' }).toJSDate())
    );
  });

  it('decodes ArrayBuffer values from base64 string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(`A1 64 74657374 70 534756736247386751304A5055694568`),
        [Test]
      )
    ).toEqual(new Test(new TextEncoder().encode('Hello CBOR!!').buffer));
  });

  it('decodes ArrayBuffer values from octet string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer
      ) {}
    }

    await expect(
      CBORDecoder.default.decodeData(
        Hex.decode(`A1 64 74657374 4C 48656C6C6F2043424F522121`),
        [Test]
      )
    ).toEqual(new Test(new TextEncoder().encode('Hello CBOR!!').buffer));
  });
});
