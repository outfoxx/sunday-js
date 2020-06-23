import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { DateTime } from 'luxon';
import { Base64 } from '../src';
import { JSONDecoder } from '../src/json-decoder';
import NumericDateDecoding = JSONDecoder.NumericDateDecoding;

describe('JSONDecoder', () => {
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });

  it('decodes jackson-js types from fetch response', async () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number,
      ) {
      }
    }


    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub,
      ) {
      }
    }


    fetchMock.mockResponseOnce('{"test":"a","sub":{"value":5}}');
    await expect(
      JSONDecoder.default.decode(await fetch('http://example.com'), [Test]),
    ).resolves.toStrictEqual(new Test('a', new Sub(5)));
  });

  it('decodes jackson-js types from string', async () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number,
      ) {
      }
    }


    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub,
      ) {
      }
    }


    expect(
      JSONDecoder.default.decodeText('{"test":"a","sub":{"value":5}}', [Test]),
    ).toStrictEqual(new Test('a', new Sub(5)));
  });

  it('decodes URL values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL,
      ) {
      }
    }


    expect(
      JSONDecoder.default.decodeText('{"test":"http://example.com"}', [Test]),
    ).toStrictEqual(new Test(new URL('http://example.com')));
  });

  it('decodes DateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime,
      ) {
      }
    }


    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01T00:00:00.000Z"}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromISO('2002-01-01T00:00:00.000Z')));
  });

  it('decodes DateTime values from number (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime,
      ) {
      }
    }


    expect(
      new JSONDecoder(NumericDateDecoding.SECONDS_SINCE_EPOCH).decodeText('{"test":981173106.789}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromISO('2001-02-03T04:05:06.789Z')));
  });

  it('decodes DateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime,
      ) {
      }
    }


    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText('{"test":981173106789}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromISO('2001-02-03T04:05:06.789Z')));
  });

  it('decodes Date values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {
      }
    }


    expect(
      JSONDecoder.default.decodeText('{"test":"2001-02-03T04:05:06.789Z"}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromSeconds(981173106.789).toJSDate()));
  });

  it('decodes Date values from number (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {
      }
    }


    expect(
      new JSONDecoder(NumericDateDecoding.SECONDS_SINCE_EPOCH).decodeText('{"test":981173106.789}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromSeconds(981173106.789).toJSDate()));
  });

  it('decodes Date values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {
      }
    }


    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText('{"test":981173106789}', [Test]),
    ).toStrictEqual(new Test(DateTime.fromMillis(981173106789).toJSDate()));
  });

  it('decodes ArrayBuffer values from Base64 encoded text', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer,
      ) {
      }
    }


    const bin = Base64.encode(new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));

    expect(
      JSONDecoder.default.decodeText(`{"test":"${bin}"}`, [Test]),
    ).toStrictEqual(new Test(Base64.decode(bin)));
  });
});
