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
import { CBOREncoder, ZonedDateTime } from '../src';
import { Hex } from '../src';

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

  it('encodes Instant values as date (string)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(
          ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            789000000,
            ZoneId.UTC
          ).toInstant()
        ),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
      )
    );
  });

  it('encodes Instant values as date (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
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
            ZoneId.UTC
          ).toInstant()
        ),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });

  it('encodes Instant values as date (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [Instant] })
        public test: Instant
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(
          ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            789000000,
            ZoneId.UTC
          ).toInstant()
        ),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 1B 000000E472797865'));
  });

  it('encodes ZonedDateTime values as date (string)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
      )
    );
  });

  it('encodes ZonedDateTime values as date (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(
        new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });

  it('encodes ZonedDateTime values as date (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [ZonedDateTime] })
        public test: ZonedDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 1B 000000E472797865'));
  });

  it('encodes OffsetDateTime values as date (string)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(
          OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC)
        ),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A'
      )
    );
  });

  it('encodes OffsetDateTime values as date (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(
        new Test(
          OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC)
        ),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });

  it('encodes OffsetDateTime values as date (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetDateTime] })
        public test: OffsetDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(
          OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC)
        ),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 1B 000000E472797865'));
  });

  it('encodes OffsetTime values as string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 6D 30343A30353A30362E3738395A'));
  });

  it('encodes OffsetTime values as array (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)), [
        Test,
      ])
    ).toEqual(Hex.decode('A1 64 74657374 85 04 05 06 1A 2F072F40 61 5A'));
  });

  it('encodes OffsetTime values as array (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [OffsetTime] })
        public test: OffsetTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(OffsetTime.of(4, 5, 6, 789000000, ZoneOffset.UTC)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 85 04 05 06 19 0315 61 5A'));
  });

  it('encodes LocalDateTime values as string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)),
        [Test]
      )
    ).toEqual(
      Hex.decode(
        'A1 64 74657374 77 323030312D30322D30335430343A30353A30362E373839'
      )
    );
  });

  it('encodes LocalDateTime values as array (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)), [
        Test,
      ])
    ).toEqual(
      Hex.decode('A1 64 74657374 87 19 07D1 02 03 04 05 06 1A 2F072F40')
    );
  });

  it('encodes LocalDateTime values as array (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDateTime] })
        public test: LocalDateTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 87 19 07D1 02 03 04 05 06 19 0315'));
  });

  it('encodes LocalDate values as string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(LocalDate.of(2001, 2, 3)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 6A 323030312D30322D3033'));
  });

  it('encodes LocalDate values as array (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(new Test(LocalDate.of(2001, 2, 3)), [Test])
    ).toEqual(Hex.decode('A1 64 74657374 83 19 07D1 02 03'));
  });

  it('encodes LocalDate values as array (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalDate] })
        public test: LocalDate
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalDate.of(2001, 2, 3)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 83 19 07D1 02 03'));
  });

  it('encodes LocalTime values as string', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.ISO8601).encode(
        new Test(LocalTime.of(4, 5, 6, 789000000)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 6C 30343A30353A30362E373839'));
  });

  it('encodes LocalTime values as array (decimal seconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      new CBOREncoder(
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(new Test(LocalTime.of(4, 5, 6, 789000000)), [Test])
    ).toEqual(Hex.decode('A1 64 74657374 84 04 05 06 1A 2F072F40'));
  });

  it('encodes LocalTime values as array (milliseconds)', async () => {
    //
    class Test {
      constructor(
        @JsonProperty()
        @JsonClassType({ type: () => [LocalTime] })
        public test: LocalTime
      ) {}
    }

    expect(
      new CBOREncoder(CBOREncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        new Test(LocalTime.of(4, 5, 6, 789000000)),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 84 04 05 06 19 0315'));
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
          new Date(Instant.parse('2001-02-03T04:05:06.789Z').toString())
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
        CBOREncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH
      ).encode(
        new Test(new Date(Instant.ofEpochMilli(981173106789).toString())),
        [Test]
      )
    ).toEqual(Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });
});
