import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { DateTime } from 'luxon';
import { JSONEncoder } from '../src/json-encoder';

describe('JSONEncoder', () => {
  it('encodes jackson-js types from fetch response', () => {
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


    expect(JSONEncoder.default.encode(new Test('a', new Sub(5)), [Test])).toBe(
      '{"test":"a","sub":{"value":5}}',
    );
  });

  it('encodes RUL values as strings', () => {
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
      JSONEncoder.default.encode(new Test(new URL('http://example.com')), [Test]),
    ).toStrictEqual('{"test":"http://example.com/"}');
  });

  it('encodes DateTime values as strings', async () => {
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
      JSONEncoder.default.encode(new Test(DateTime.fromISO('2002-01-01T00:00:00.000Z')), [Test]),
    ).toStrictEqual('{"test":"2002-01-01T00:00:00.000-00:00"}');
  });

  it('encodes DateTime values as numbers (seconds)', async () => {
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
      new JSONEncoder(JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH)
        .encode(new Test(DateTime.fromSeconds(981173106.789)), [Test]),
    ).toStrictEqual('{"test":981173106.789}');
  });

  it('encodes DateTime values as numbers (seconds)', async () => {
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
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH)
        .encode(new Test(DateTime.fromMillis(981173106789)), [Test]),
    ).toStrictEqual('{"test":981173106789}');
  });

  it('encodes Date values as strings', async () => {
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
      JSONEncoder.default.encode(new Test(DateTime.fromISO('2002-01-01T00:00:00.000Z').toJSDate()), [Test]),
    ).toStrictEqual('{"test":"2002-01-01T00:00:00.000Z"}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
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
      new JSONEncoder(JSONEncoder.DateEncoding.SECONDS_SINCE_EPOCH)
        .encode(new Test(DateTime.fromSeconds(981173106.789).toJSDate()), [Test]),
    ).toStrictEqual('{"test":981173106.789}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
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
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH)
        .encode(new Test(DateTime.fromMillis(981173106789).toJSDate()), [Test]),
    ).toStrictEqual('{"test":981173106789}');
  });

  it('encodes ArrayBuffer values as Base64', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer,
      ) {
      }
    }


    expect(
      JSONEncoder.default.encode(new Test(new ArrayBuffer(5)), [Test]),
    ).toStrictEqual('{"test":"AAAAAAA="}');
  });
});
