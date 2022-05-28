// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  ZonedDateTime,
  ZoneId,
  ZoneOffset,
} from '@js-joda/core';
import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { JSONEncoder } from '../src';
import DateEncoding = JSONEncoder.DateEncoding;

describe('JSONEncoder', () => {
  it('encodes jackson-js object trees', () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number,
      ) {}
    }

    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub,
      ) {}
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
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(new URL('http://example.com')), [
        Test,
      ]),
    ).toEqual('{"test":"http://example.com/"}');
  });

  it('encodes Instant values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(
          ZonedDateTime.of(
            2002,
            1,
            1,
            1,
            2,
            3,
            4000000,
            ZoneId.UTC,
          ).toInstant(),
        ),
        [Test],
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes Instant values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(
        new Test(
          ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            789000000,
            ZoneId.UTC,
          ).toInstant(),
        ),
        [Test],
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes Instant values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(
          ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            789000000,
            ZoneId.UTC,
          ).toInstant(),
        ),
        [Test],
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes ZonedDateTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC)),
        [Test],
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z[Z]"}');
  });

  it('encodes ZonedDateTime values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(
        new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
        [Test],
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes ZonedDateTime values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
        [Test],
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes OffsetDateTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(
          OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
        ),
        [Test],
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes OffsetDateTime values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(
        new Test(
          OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
        ),
        [Test],
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes OffsetDateTime values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(
          OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
        ),
        [Test],
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes OffsetTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC)),
        [Test],
      ),
    ).toEqual('{"test":"01:02:03.004Z"}');
  });

  it('encodes OffsetTime values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)), [
        Test,
      ]),
    ).toEqual('{"test":[4,5,6,789000000,"Z"]}');
  });

  it('encodes OffsetTime values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)),
        [Test],
      ),
    ).toEqual('{"test":[4,5,6,789,"Z"]}');
  });

  it('encodes LocalDateTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(LocalDateTime.of(2001, 1, 1, 1, 2, 3, 4000000)),
        [Test],
      ),
    ).toEqual('{"test":"2001-01-01T01:02:03.004"}');
  });

  it('encodes LocalDateTime values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)), [
        Test,
      ]),
    ).toEqual('{"test":[2001,2,3,4,5,6,789000000]}');
  });

  it('encodes LocalDateTime values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)),
        [Test],
      ),
    ).toEqual('{"test":[2001,2,3,4,5,6,789]}');
  });

  it('encodes LocalDate values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(LocalDate.of(2001, 1, 1)),
        [Test],
      ),
    ).toEqual('{"test":"2001-01-01"}');
  });

  it('encodes LocalDate values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(new Test(LocalDate.of(2001, 2, 3)), [Test]),
    ).toEqual('{"test":[2001,2,3]}');
  });

  it('encodes LocalDate values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalDate.of(2001, 2, 3)),
        [Test],
      ),
    ).toEqual('{"test":[2001,2,3]}');
  });

  it('encodes LocalTime values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        new Test(LocalTime.of(1, 2, 3, 4000000)),
        [Test],
      ),
    ).toEqual('{"test":"01:02:03.004"}');
  });

  it('encodes LocalTime values as number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(new Test(LocalTime.of(4, 5, 6, 789000000)), [Test]),
    ).toEqual('{"test":[4,5,6,789000000]}');
  });

  it('encodes LocalTime values as number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalTime.of(4, 5, 6, 789000000)),
        [Test],
      ),
    ).toEqual('{"test":[4,5,6,789]}');
  });

  it('encodes Date values as strings', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.ISO8601).encode(
        new Test(
          new Date(Instant.parse('2002-01-01T00:00:00.000Z').toString()),
        ),
        [Test],
      ),
    ).toEqual('{"test":"2002-01-01T00:00:00.000Z"}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new JSONEncoder(
        JSONEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).encode(
        new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
        [Test],
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new JSONEncoder(JSONEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
        [Test],
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes ArrayBuffer values as Base64', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer,
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(new ArrayBuffer(5)), [Test]),
    ).toEqual('{"test":"AAAAAAA="}');
  });

  it('excludes null & undefined values by default when encoding', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer | undefined | null,
      ) {}
    }

    expect(JSONEncoder.default.encode(new Test(undefined), [Test])).toEqual(
      '{}',
    );

    expect(JSONEncoder.default.encode(new Test(null), [Test])).toEqual('{}');
  });

  it('includes null values when encoding configured', () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer | undefined | null,
      ) {}
    }

    expect(
      JSONEncoder.default.encode(new Test(undefined), [Test], true),
    ).toEqual('{}');

    expect(JSONEncoder.default.encode(new Test(null), [Test], true)).toEqual(
      '{"test":null}',
    );
  });
});
