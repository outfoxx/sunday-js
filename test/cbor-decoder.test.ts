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
  ZoneId,
  ZoneOffset,
} from '@js-joda/core';
import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import fetchMock from 'fetch-mock';
import { CBORDecoder, Hex, ZonedDateTime } from '../src';
import NumericDateDecoding = CBORDecoder.NumericDateDecoding;

describe('CBORDecoder', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('decodes jackson-js types from fetch response', async () => {
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

    fetchMock.getOnce(
      'http://example.com',
      new Response(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
      ),
    );
    await expectAsync(
      CBORDecoder.default.decode(await fetch('http://example.com'), [Test]),
    ).toBeResolvedTo(new Test('a', new Sub(5)));
  });

  it('decodes jackson-js types from string', async () => {
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

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
        [Test],
      ),
    ).toEqual(new Test('a', new Sub(5)));
  });

  it('decodes URL values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 73 687474703A2F2F6578616D706C652E636F6D2F'),
        [Test],
      ),
    ).toEqual(new Test(new URL('http://example.com')));
  });

  it('decodes URL values from tagged URL', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [URL] })
        public test: URL,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 D8 20 72 687474703A2F2F6578616D706C652E636F6D',
        ),
        [Test],
      ),
    ).toEqual(new Test(new URL('http://example.com')));
  });

  it('decodes Instant values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(
        ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
      ),
    );
  });

  it('decodes Instant values from date tagged string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(
        ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
      ),
    );
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
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
    );
  });

  it('decodes Instant values from date tagged number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
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
    );
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
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
    );
  });

  it('decodes Instant values from date tagged number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
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
    );
  });

  it('decodes ZonedDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC)),
    );
  });

  it('decodes ZonedDateTime values from date tagged string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC)),
    );
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
    );
  });

  it('decodes ZonedDateTime values from date tagged number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
    );
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
    );
  });

  it('decodes ZonedDateTime values from date tagged number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
    );
  });

  it('decodes OffsetDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC)),
    );
  });

  it('decodes OffsetDateTime values from date tagged string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC)),
    );
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
      ),
    );
  });

  it('decodes OffsetDateTime values from date tagged number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
      ),
    );
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
      ),
    );
  });

  it('decodes OffsetDateTime values from date tagged number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(
        OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
      ),
    );
  });

  it('decodes OffsetTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6D 30313A30323A30332E3030345A'),
        [Test],
      ),
    ).toEqual(new Test(OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC)));
  });

  it('decodes OffsetTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 85 04 05 06 1A 2F072F40 61 5A'), [
        Test,
      ]),
    ).toEqual(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)));
  });

  it('decodes OffsetTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 85 04 05 06 19 0315 61 5A'),
        [Test],
      ),
    ).toEqual(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)));
  });

  it('decodes LocalDateTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 77 323030322D30312D30315430313A30323A30332E303034',
        ),
        [Test],
      ),
    ).toEqual(new Test(LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000)));
  });

  it('decodes LocalDateTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 87 19 07D1 02 03 04 05 06 1A 2F072F40'),
        [Test],
      ),
    ).toEqual(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)));
  });

  it('decodes LocalDateTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 87 19 07D1 02 03 04 05 06 19 0315'),
        [Test],
      ),
    ).toEqual(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)));
  });

  it('decodes LocalDate values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6A 323030322D30312D3031'),
        [Test],
      ),
    ).toEqual(new Test(LocalDate.of(2002, 1, 1)));
  });

  it('decodes LocalDate values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 83 19 07D1 02 03'), [Test]),
    ).toEqual(new Test(LocalDate.of(2001, 2, 3)));
  });

  it('decodes LocalDate values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 83 19 07D1 02 03'),
        [Test],
      ),
    ).toEqual(new Test(LocalDate.of(2001, 2, 3)));
  });

  it('decodes LocalTime values from string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6C 30313A30323A30332E303034'),
        [Test],
      ),
    ).toEqual(new Test(LocalTime.of(1, 2, 3, 4000000)));
  });

  it('decodes LocalTime values from number (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 84 04 05 06 1A 2F072F40'), [
        Test,
      ]),
    ).toEqual(new Test(LocalTime.of(4, 5, 6, 789000000)));
  });

  it('decodes LocalTime values from number (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 84 04 05 06 19 0315'),
        [Test],
      ),
    ).toEqual(new Test(LocalTime.of(4, 5, 6, 789000000)));
  });

  it('decodes Date values from ISO string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes Date values from ISO date', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        [Test],
      ),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes Date values from numeric epoch (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes Date values from numeric epoch (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes Date values from epoch date (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'), [Test]),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes Date values from epoch date (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Date] })
        public test: Date,
      ) {}
    }

    expect(
      new CBORDecoder(NumericDateDecoding.MILLISECONDS_SINCE_EPOCH).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        [Test],
      ),
    ).toEqual(
      new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
    );
  });

  it('decodes ArrayBuffer values from base64 string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(`A1 64 74657374 70 534756736247386751304A5055694568`),
        [Test],
      ),
    ).toEqual(new Test(new TextEncoder().encode('Hello CBOR!!').buffer));
  });

  it('decodes ArrayBuffer values from octet string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ArrayBuffer] })
        public test: ArrayBuffer,
      ) {}
    }

    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(`A1 64 74657374 4C 48656C6C6F2043424F522121`),
        [Test],
      ),
    ).toEqual(new Test(new TextEncoder().encode('Hello CBOR!!').buffer));
  });
});
