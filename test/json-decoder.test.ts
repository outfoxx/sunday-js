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
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  ZoneId,
  ZoneOffset,
} from '@js-joda/core';
import fetchMock from 'fetch-mock';
import {
  arrayBufferSerde,
  Base64,
  dateSerde,
  instantSerde,
  JSONDecoder,
  localDateSerde,
  localDateTimeSerde,
  localTimeSerde,
  numberSerde,
  offsetDateTimeSerde,
  offsetTimeSerde,
  Serde,
  stringSerde,
  urlSerde,
  ZonedDateTime,
  Instant,
  zonedDateTimeSerde,
} from '../src';
import { expectEqual } from './expect-utils';
import { objectSerde } from './serde-test-helpers';
import NumericDateDecoding = JSONDecoder.NumericDateDecoding;

const testSerde = <T>(serde: Serde<T>) =>
  objectSerde<{ test: T }>('Test', { test: { serde } });

describe('JSONDecoder', () => {
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

    fetchMock.getOnce('http://example.com', '{"test":"a","sub":{"value":5}}');
    expect(
      JSONDecoder.default.decode(await fetch('http://example.com'), testSerdeObj),
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
      JSONDecoder.default.decodeText(
        '{"test":"a","sub":{"value":5}}',
        testSerdeObj,
      ),
    ).toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes URL values from string', async () => {
    expectEqual(
      JSONDecoder.default.decodeText(
        '{"test":"http://example.com"}',
        testSerde(urlSerde),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('decodes Instant values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSerde(instantSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106.007}', testSerde(instantSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106007}', testSerde(instantSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes ZonedDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSerde(zonedDateTimeSerde),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[981173106.007,"Z","Z"]}', testSerde(zonedDateTimeSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[981173106007,"Z","Z"]}', testSerde(zonedDateTimeSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from legacy number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106007}', testSerde(zonedDateTimeSerde)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes OffsetDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSerde(offsetDateTimeSerde),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[981173106.007,"Z"]}', testSerde(offsetDateTimeSerde)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[981173106007,"Z"]}', testSerde(offsetDateTimeSerde)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from legacy number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106007}', testSerde(offsetDateTimeSerde)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"01:02:03.004Z"}',
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[3723.004,"Z"]}', testSerde(offsetTimeSerde)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":[3723004,"Z"]}', testSerde(offsetTimeSerde)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from legacy number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":3723004}', testSerde(offsetTimeSerde)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from legacy array', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":[1,2,3,4000000,"Z"]}',
        testSerde(offsetTimeSerde),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes LocalDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004"}',
        testSerde(localDateTimeSerde),
      ),
    ).toEqual({
      test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
    });
  });

  it('decodes LocalDateTime values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106.007}', testSerde(localDateTimeSerde)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('decodes LocalDateTime values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106007}', testSerde(localDateTimeSerde)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('decodes LocalDateTime values from legacy array', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":[2001,2,3,4,5,6,7000000]}',
        testSerde(localDateTimeSerde),
      ),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('decodes LocalDate values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01"}',
        testSerde(localDateSerde),
      ),
    ).toEqual({ test: LocalDate.of(2002, 1, 1) });
  });

  it('decodes LocalDate values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981158400}', testSerde(localDateSerde)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalDate values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981158400000}', testSerde(localDateSerde)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"01:02:03.004"}',
        testSerde(localTimeSerde),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (decimal seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":3723.004}', testSerde(localTimeSerde)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":3723004}', testSerde(localTimeSerde)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from legacy array', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":[1,2,3,4000000]}',
        testSerde(localTimeSerde),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes Date values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2001-02-03T04:05:06.789Z"}',
        testSerde(dateSerde),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from number (seconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106.789}', testSerde(dateSerde)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from number (milliseconds)', async () => {
    expect(
      new JSONDecoder(
        NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      ).decodeText('{"test":981173106789}', testSerde(dateSerde)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes ArrayBuffer values from Base64 encoded text', async () => {
    const bin = Base64.encode(
      new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]).buffer,
    );

    expectEqual(
      JSONDecoder.default.decodeText(
        `{"test":"${bin}"}`,
        testSerde(arrayBufferSerde),
      ),
      { test: Base64.decode(bin) },
    );
  });
});
