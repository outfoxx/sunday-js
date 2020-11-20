import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { DateTime } from 'luxon';
import { JSONEncoder } from '../src';

describe('JSONEncoder', () => {
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

    expect(JSONEncoder.default.encode(new Test('a', new Sub(5)), [Test])).toBe(
      '{"test":"a","sub":{"value":5}}'
    );
  });

  it('encodes RUL values as strings', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(new URL('http://example.com')), [
        Test,
      ])
    ).toEqual('{"test":"http://example.com/"}');
  });

  it('encodes DateTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    expect(
      JSONEncoder.default.encode(
        new Test(
          DateTime.fromISO('2002-01-01T00:00:00.000Z', { setZone: true })
        ),
        [Test]
      )
    ).toEqual('{"test":"2002-01-01T00:00:00.000Z"}');
  });

  it('encodes DateTime values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromSeconds(981173106.789)), [Test])
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes DateTime values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [DateTime] })
        public test: DateTime
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromMillis(981173106789)), [Test])
    ).toEqual('{"test":981173106789}');
  });

  it('encodes Date values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      JSONEncoder.default.encode(
        new Test(
          DateTime.fromISO('2002-01-01T00:00:00.000Z', {
            setZone: true,
          }).toJSDate()
        ),
        [Test]
      )
    ).toEqual('{"test":"2002-01-01T00:00:00.000Z"}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromSeconds(981173106.789).toJSDate()), [Test])
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
      ).encode(new Test(DateTime.fromMillis(981173106789).toJSDate()), [Test])
    ).toEqual('{"test":981173106789}');
  });

  it('encodes ArrayBuffer values as Base64', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(new ArrayBuffer(5)), [Test])
    ).toEqual('{"test":"AAAAAAA="}');
  });

  it('excludes null & undefined values by default when encoding', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer | undefined | null
      ) {}
    }

    expect(JSONEncoder.default.encode(new Test(undefined), [Test])).toEqual(
      '{}'
    );

    expect(JSONEncoder.default.encode(new Test(null), [Test])).toEqual('{}');
  });

  it('includes null values when encoding configured', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer | undefined | null
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(undefined), [Test], true)
    ).toEqual('{}');

    expect(JSONEncoder.default.encode(new Test(null), [Test], true)).toEqual(
      '{"test":null}'
    );
  });
});
