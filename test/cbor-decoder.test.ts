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

import {beforeEach, describe, it, expect} from 'bun:test';
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
import fetchMock from 'fetch-mock';
import {
  arrayBufferSerde,
  CBORDecoder,
  dateSerde,
  instantSerde,
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
  Hex,
} from '../src';
import { expectEqual } from './expect-utils';
import { objectSerde } from './serde-test-helpers';
import NumericDateDecoding = CBORDecoder.NumericDateDecoding;

const testSerde = <T>(serde: Serde<T>) =>
  objectSerde<{ test: T }>('Test', { test: { serde } });

describe('CBORDecoder', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('decodes object types from fetch response', async () => {
    type Sub = { value: number };
    type Test = { test: string; sub: Sub };

    const subSerde = objectSerde<Sub>('Sub', {
      value: { serde: numberSerde },
    });
    const testSerdeObj = objectSerde<Test>('Test', {
      test: { serde: stringSerde },
      sub: { serde: subSerde },
    });

    fetchMock.getOnce(
      'http://example.com',
      new Response(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
      ),
    );
    expect(
      CBORDecoder.default.decode(await fetch('http://example.com'), testSerdeObj),
    ).resolves.toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes object types from string', async () => {
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
      CBORDecoder.default.decodeData(
        Hex.decode('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
        testSerdeObj,
      ),
    ).toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes URL values from string', async () => {
    expectEqual(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 73 687474703A2F2F6578616D706C652E636F6D2F'),
        testSerde(urlSerde),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('decodes URL values from tagged URL', async () => {
    expectEqual(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 D8 20 72 687474703A2F2F6578616D706C652E636F6D',
        ),
        testSerde(urlSerde),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('decodes Instant values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSerde(instantSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from date tagged string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSerde(instantSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), testSerde(instantSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from date tagged number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSerde(instantSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1B 000000E472797865'), testSerde(instantSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from date tagged number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        testSerde(instantSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes ZonedDateTime values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 1B 323030322D30312D30315430313A30323A30332E3030345A5B5A5D',
        ),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from date tagged string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 1B 323030322D30312D30315430313A30323A30332E3030345A5B5A5D',
        ),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode(
          'A1 64 74657374 83 FB 41CD3DC1B900E560 61 5A 61 5A',
        ),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from legacy number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), testSerde(zonedDateTimeSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from date tagged number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode(
          'A1 64 74657374 83 1B 000000E472797557 61 5A 61 5A',
        ),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from date tagged number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC),
    });
  });

  it('decodes OffsetDateTime values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from date tagged string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 82 FB 41CD3DC1B900E560 61 5A'),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from legacy number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), testSerde(offsetDateTimeSerde)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from date tagged number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 82 1B 000000E472797557 61 5A'),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from date tagged number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6D 30313A30323A30332E3030345A'),
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 82 FB 40AD16020C49BA5E 61 5A'),
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 82 1A 0038CEFC 61 5A'),
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from legacy number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1A 0038CEFC'), testSerde(offsetTimeSerde)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from legacy array', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 85 01 02 03 1A 00 3D 09 00 61 5A'),
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes LocalDateTime values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 77 323030322D30312D30315430313A30323A30332E303034'),
        testSerde(localDateTimeSerde),
      ),
    ).toEqual({
      test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
    });
  });

  it('decodes LocalDateTime values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), testSerde(localDateTimeSerde)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000),
    });
  });

  it('decodes LocalDateTime values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1B 000000E472797865'), testSerde(localDateTimeSerde)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000),
    });
  });

  it('decodes LocalDateTime values from legacy array', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 87 19 07 D1 02 03 04 05 06 1A 00 6A CF C0'),
        testSerde(localDateTimeSerde),
      ),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('decodes LocalDate values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6A 323030322D30312D3031'),
        testSerde(localDateSerde),
      ),
    ).toEqual({ test: LocalDate.of(2002, 1, 1) });
  });

  it('decodes LocalDate values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1A 3A7B9500'), testSerde(localDateSerde)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalDate values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1B 000000E471991000'), testSerde(localDateSerde)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalTime values from string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 6C 30313A30323A30332E303034'),
        testSerde(localTimeSerde),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 40AD16020C49BA5E'), testSerde(localTimeSerde)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1A 0038CEFC'), testSerde(localTimeSerde)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from legacy array', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 84 01 02 03 1A 00 3D 09 00'),
        testSerde(localTimeSerde),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes Date values from ISO string', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        testSerde(dateSerde),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from ISO date', async () => {
    expect(
      CBORDecoder.default.decodeData(
        Hex.decode(
          'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        testSerde(dateSerde),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from numeric epoch (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 FB 41CD3DC1B964FDF4'), testSerde(dateSerde)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from numeric epoch (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(Hex.decode('A1 64 74657374 1B 000000E472797865'), testSerde(dateSerde)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from epoch date (decimal seconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSerde(dateSerde),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from epoch date (milliseconds)', async () => {
    expect(
      new CBORDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeData(
        Hex.decode('A1 64 74657374 C1 1B 000000E472797865'),
        testSerde(dateSerde),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes ArrayBuffer values from base64 string', async () => {
    expectEqual(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 70 534756736247386751304A5055694568'),
        testSerde(arrayBufferSerde),
      ),
      { test: new TextEncoder().encode('Hello CBOR!!').buffer },
    );
  });

  it('decodes ArrayBuffer values from octet string', async () => {
    expectEqual(
      CBORDecoder.default.decodeData(
        Hex.decode('A1 64 74657374 4C 48656C6C6F2043424F522121'),
        testSerde(arrayBufferSerde),
      ),
      { test: new TextEncoder().encode('Hello CBOR!!').buffer },
    );
  });
});
