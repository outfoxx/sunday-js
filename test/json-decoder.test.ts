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
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  ZoneId,
  ZoneOffset,
} from '@js-joda/core';
import fetchMock from 'fetch-mock';
import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { Base64, Instant, JSONDecoder, ZonedDateTime } from '../src';
import NumericDateDecoding = JSONDecoder.NumericDateDecoding;

describe('JSONDecoder', () => {
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

    fetchMock.getOnce('http://example.com', '{"test":"a","sub":{"value":5}}');
    await expectAsync(
      JSONDecoder.default.decode(await fetch('http://example.com'), [Test])
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

    expect(
      JSONDecoder.default.decodeText('{"test":"a","sub":{"value":5}}', [Test])
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

    expect(
      JSONDecoder.default.decodeText('{"test":"http://example.com"}', [Test])
    ).toEqual(new Test(new URL('http://example.com')));
  });

  it('decodes Instant values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01T01:02:03.004Z"}', [
        Test,
      ])
    ).toEqual(
      new Test(
        ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant()
      )
    );
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":981173106.789}', [Test])
    ).toEqual(
      new Test(
        ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant()
      )
    );
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":981173106789}',
        [Test]
      )
    ).toEqual(
      new Test(
        ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant()
      )
    );
  });

  it('decodes ZonedDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01T01:02:03.004Z"}', [
        Test,
      ])
    ).toEqual(
      new Test(ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC))
    );
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":981173106.789}', [Test])
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC))
    );
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":981173106789}',
        [Test]
      )
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC))
    );
  });

  it('decodes OffsetDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01T01:02:03.004Z"}', [
        Test,
      ])
    ).toEqual(
      new Test(OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC))
    );
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":981173106.789}', [Test])
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC)
      )
    );
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":981173106789}',
        [Test]
      )
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC)
      )
    );
  });

  it('decodes OffsetTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"01:02:03.004Z"}', [Test])
    ).toEqual(new Test(OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC)));
  });

  it('decodes OffsetTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":[4,5,6,789000000,"Z"]}', [Test])
    ).toEqual(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)));
  });

  it('decodes OffsetTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":[4,5,6,789,"Z"]}',
        [Test]
      )
    ).toEqual(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)));
  });

  it('decodes LocalDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01T01:02:03.004"}', [
        Test,
      ])
    ).toEqual(new Test(LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000)));
  });

  it('decodes LocalDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":[2001,2,3,4,5,6,789000000]}', [Test])
    ).toEqual(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)));
  });

  it('decodes LocalDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":[2001,2,3,4,5,6,789]}',
        [Test]
      )
    ).toEqual(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)));
  });

  it('decodes LocalDate values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2002-01-01"}', [Test])
    ).toEqual(new Test(LocalDate.of(2002, 1, 1)));
  });

  it('decodes LocalDate values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":[2001,2,3]}', [Test])
    ).toEqual(new Test(LocalDate.of(2001, 2, 3)));
  });

  it('decodes LocalDate values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":[2001,2,3]}',
        [Test]
      )
    ).toEqual(new Test(LocalDate.of(2001, 2, 3)));
  });

  it('decodes LocalTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"01:02:03.004"}', [Test])
    ).toEqual(new Test(LocalTime.of(1, 2, 3, 4000000)));
  });

  it('decodes LocalTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":[4,5,6,789000000]}', [Test])
    ).toEqual(new Test(LocalTime.of(4, 5, 6, 789000000)));
  });

  it('decodes LocalTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":[4,5,6,789]}',
        [Test]
      )
    ).toEqual(new Test(LocalTime.of(4, 5, 6, 789000000)));
  });

  it('decodes Date values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      JSONDecoder.default.decodeText('{"test":"2001-02-03T04:05:06.789Z"}', [
        Test,
      ])
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString()))
    );
  });

  it('decodes Date values from number (seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).decodeText('{"test":981173106.789}', [Test])
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString()))
    );
  });

  it('decodes Date values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date
      ) {}
    }

    expect(
      new JSONDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeText(
        '{"test":981173106789}',
        [Test]
      )
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString()))
    );
  });

  it('decodes ArrayBuffer values from Base64 encoded text', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer
      ) {}
    }

    const bin = Base64.encode(new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));

    expect(JSONDecoder.default.decodeText(`{"test":"${bin}"}`, [Test])).toEqual(
      new Test(Base64.decode(bin))
    );
  });
});
