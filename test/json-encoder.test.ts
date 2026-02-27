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

import {describe, it, expect} from 'bun:test';
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
import {
  arrayBufferSerde,
  dateSerde,
  instantSerde,
  JSONEncoder,
  localDateSerde,
  localDateTimeSerde,
  localTimeSerde,
  numberSerde,
  offsetDateTimeSerde,
  offsetTimeSerde,
  Serde,
  stringSerde,
  urlSerde,
  zonedDateTimeSerde,
} from '../src';
import { objectSerde } from './serde-test-helpers';
import DateEncoding = JSONEncoder.DateEncoding;

const testSerde = <T>(serde: Serde<T>) =>
  objectSerde<{ test: T }>('Test', { test: { serde } });

describe('JSONEncoder', () => {
  it('encodes object trees', () => {
    type Sub = { value: number };
    type Test = { test: string; sub: Sub };

    const subSerde = objectSerde<Sub>('Sub', {
      value: { serde: numberSerde },
    });
    const testSerdeObj = objectSerde<Test>('Test', {
      test: { serde: stringSerde },
      sub: { serde: subSerde },
    });

    expect(
      JSONEncoder.default.encode({ test: 'a', sub: { value: 5 } }, testSerdeObj),
    ).toBe('{"test":"a","sub":{"value":5}}');
  });

  it('encodes RUL values as strings', () => {
    expect(
      JSONEncoder.default.encode(
        { test: new URL('http://example.com') },
        testSerde(urlSerde),
      ),
    ).toEqual('{"test":"http://example.com/"}');
  });

  it('encodes Instant values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        {
          test: ZonedDateTime.of(
            2002,
            1,
            1,
            1,
            2,
            3,
            4000000,
            ZoneId.UTC,
          ).toInstant(),
        },
        testSerde(instantSerde),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes Instant values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        {
          test: ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneId.UTC,
          ).toInstant(),
        },
        testSerde(instantSerde),
      ),
    ).toEqual('{"test":981173106.007}');
  });

  it('encodes Instant values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        {
          test: ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneId.UTC,
          ).toInstant(),
        },
        testSerde(instantSerde),
      ),
    ).toEqual('{"test":981173106007}');
  });

  it('encodes ZonedDateTime values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        {
          test: ZonedDateTime.of(
            2002,
            1,
            1,
            1,
            2,
            3,
            4000000,
            ZoneId.UTC,
          ),
        },
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z[Z]"}');
  });

  it('encodes ZonedDateTime values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        {
          test: ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneId.UTC,
          ),
        },
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual('{"test":[981173106.007,"Z","Z"]}');
  });

  it('encodes ZonedDateTime values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        {
          test: ZonedDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneId.UTC,
          ),
        },
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual('{"test":[981173106007,"Z","Z"]}');
  });

  it('encodes OffsetDateTime values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        {
          test: OffsetDateTime.of(
            2002,
            1,
            1,
            1,
            2,
            3,
            4000000,
            ZoneOffset.UTC,
          ),
        },
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes OffsetDateTime values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        {
          test: OffsetDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneOffset.UTC,
          ),
        },
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual('{"test":[981173106.007,"Z"]}');
  });

  it('encodes OffsetDateTime values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        {
          test: OffsetDateTime.of(
            2001,
            2,
            3,
            4,
            5,
            6,
            7000000,
            ZoneOffset.UTC,
          ),
        },
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual('{"test":[981173106007,"Z"]}');
  });

  it('encodes OffsetTime values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSerde(offsetTimeSerde),
      ),
    ).toEqual('{"test":"01:02:03.004Z"}');
  });

  it('encodes OffsetTime values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSerde(offsetTimeSerde),
      ),
    ).toEqual('{"test":[3723.004,"Z"]}');
  });

  it('encodes OffsetTime values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSerde(offsetTimeSerde),
      ),
    ).toEqual('{"test":[3723004,"Z"]}');
  });

  it('encodes LocalDateTime values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        {
          test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
        },
        testSerde(localDateTimeSerde),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004"}');
  });

  it('encodes LocalDateTime values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        {
          test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
        },
        testSerde(localDateTimeSerde),
      ),
    ).toEqual('{"test":981173106.007}');
  });

  it('encodes LocalDateTime values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        {
          test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
        },
        testSerde(localDateTimeSerde),
      ),
    ).toEqual('{"test":981173106007}');
  });

  it('encodes LocalDate values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        { test: LocalDate.of(2002, 1, 1) },
        testSerde(localDateSerde),
      ),
    ).toEqual('{"test":"2002-01-01"}');
  });

  it('encodes LocalDate values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSerde(localDateSerde),
      ),
    ).toEqual('{"test":981158400}');
  });

  it('encodes LocalDate values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSerde(localDateSerde),
      ),
    ).toEqual('{"test":981158400000}');
  });

  it('encodes LocalTime values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSerde(localTimeSerde),
      ),
    ).toEqual('{"test":"01:02:03.004"}');
  });

  it('encodes LocalTime values as number (decimal seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSerde(localTimeSerde),
      ),
    ).toEqual('{"test":3723.004}');
  });

  it('encodes LocalTime values as number (milliseconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSerde(localTimeSerde),
      ),
    ).toEqual('{"test":3723004}');
  });

  it('encodes Date values as strings', async () => {
    expect(
      new JSONEncoder(DateEncoding.ISO8601).encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSerde(dateSerde),
      ),
    ).toEqual('{"test":"2001-02-03T04:05:06.789Z"}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH).encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSerde(dateSerde),
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    expect(
      new JSONEncoder(DateEncoding.MILLISECONDS_SINCE_EPOCH).encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSerde(dateSerde),
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes ArrayBuffer values as Base64', () => {
    expect(
      JSONEncoder.default.encode({ test: new ArrayBuffer(5) }, testSerde(arrayBufferSerde)),
    ).toEqual('{"test":"AAAAAAA="}');
  });

  it('excludes null & undefined values by default when encoding', () => {
    type Test = { test?: ArrayBuffer | null };
    const testSerdeObj = objectSerde<Test>('Test', {
      test: { serde: arrayBufferSerde, optional: true, nullable: true },
    });

    expect(JSONEncoder.default.encode({ test: undefined }, testSerdeObj)).toEqual(
      '{}',
    );

    expect(JSONEncoder.default.encode({ test: null }, testSerdeObj)).toEqual(
      '{}',
    );
  });

  it('includes null values when encoding configured', () => {
    type Test = { test?: ArrayBuffer | null };
    const testSerdeObj = objectSerde<Test>('Test', {
      test: { serde: arrayBufferSerde, optional: true, nullable: true },
    });

    expect(
      JSONEncoder.default.encode({ test: undefined }, testSerdeObj, true),
    ).toEqual('{}');

    expect(JSONEncoder.default.encode({ test: null }, testSerdeObj, true)).toEqual(
      '{"test":null}',
    );
  });
});
