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
  ArrayBufferSchema,
  DateSchema,
  DurationSchema,
  InstantSchema,
  JSONDecoder,
  LocalDateSchema,
  LocalDateTimeSchema,
  LocalTimeSchema,
  OffsetDateTimeSchema,
  OffsetTimeSchema,
  SchemaLike,
  URLSchema,
  ZonedDateTimeSchema,
} from '../src';
import {
  Duration,
  Instant,
  LocalDate,
  LocalDateTime,
  LocalTime,
  OffsetDateTime,
  OffsetTime,
  ZonedDateTime,
  ZoneId,
  ZoneOffset,
} from '../src';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import { expectEqual } from './expect-utils';
import NumericDateDecoding = JSONDecoder.NumericDateDecoding;

const testSchema = <T>(runtime: JSONDecoder['runtime'], ref: SchemaLike<T>) =>
  z.object({
    test: runtime.resolveSchema(ref),
  }) as unknown as z.ZodType<{ test: T }>;

describe('JSONDecoder', () => {
  beforeEach(() => {
    fetchMock.hardReset().mockGlobal();
  });

  it('decodes object types from fetch response', async () => {
    const subSchema = z.object({
      value: z.number(),
    });
    const testSchemaObj = z.object({
      test: z.string(),
      sub: subSchema,
    });

    fetchMock.getOnce('http://example.com', '{"test":"a","sub":{"value":5}}');
    expect(
      JSONDecoder.default.decode(await fetch('http://example.com'), testSchemaObj),
    ).resolves.toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes object types from string', async () => {
    const subSchema = z.object({
      value: z.number(),
    });
    const testSchemaObj = z.object({
      test: z.string(),
      sub: subSchema,
    });

    expect(
      JSONDecoder.default.decodeText(
        '{"test":"a","sub":{"value":5}}',
        testSchemaObj,
      ),
    ).toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes URL values from string', async () => {
    expectEqual(
      JSONDecoder.default.decodeText(
        '{"test":"http://example.com"}',
        testSchema(JSONDecoder.default.runtime, URLSchema),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('fails to decode invalid URL values from string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-a-url"}',
        testSchema(JSONDecoder.default.runtime, URLSchema),
      ),
    ).toThrow(/Invalid URL value/u);
  });

  it('decodes Instant values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSchema(JSONDecoder.default.runtime, InstantSchema),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106.007}', testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106007}', testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC).toInstant(),
    });
  });

  it('decodes Instant values from decimal seconds that round up to the next second', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":1.9999999996}', testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({ test: Instant.ofEpochSecond(2, 0) });
  });

  it('decodes Instant values from negative decimal seconds', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":-1.2}', testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({ test: Instant.ofEpochSecond(-2, 800000000) });
  });

  it('fails to decode Instant values from invalid string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-an-instant"}',
        testSchema(JSONDecoder.default.runtime, InstantSchema),
      ),
    ).toThrow(/Invalid ISO instant/u);
  });

  it('decodes ZonedDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSchema(JSONDecoder.default.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
      test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106.007}', testSchema(decoder.runtime, ZonedDateTimeSchema)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106007}', testSchema(decoder.runtime, ZonedDateTimeSchema)),
    ).toEqual({
      test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    });
  });

  it('fails to decode ZonedDateTime values from invalid string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-a-zoned-date-time"}',
        testSchema(JSONDecoder.default.runtime, ZonedDateTimeSchema),
      ),
    ).toThrow(/Invalid ISO zoned date-time/u);
  });

  it('decodes OffsetDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004Z"}',
        testSchema(JSONDecoder.default.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
      test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106.007}', testSchema(decoder.runtime, OffsetDateTimeSchema)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106007}', testSchema(decoder.runtime, OffsetDateTimeSchema)),
    ).toEqual({
      test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    });
  });

  it('fails to decode OffsetDateTime values from invalid string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-an-offset-date-time"}',
        testSchema(JSONDecoder.default.runtime, OffsetDateTimeSchema),
      ),
    ).toThrow(/Invalid ISO offset date-time/u);
  });

  it('decodes OffsetTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"01:02:03.004Z"}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[1,2,3,4000000,"Z"]}', testSchema(decoder.runtime, OffsetTimeSchema)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('decodes OffsetTime values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[1,2,3,4,"Z"]}', testSchema(decoder.runtime, OffsetTimeSchema)),
    ).toEqual({
      test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    });
  });

  it('fails to decode OffsetTime values from arrays with invalid length', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1,2]}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toThrow(/OffsetTime numeric timestamps must be/u);
  });

  it('fails to decode OffsetTime values from arrays without offset string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1,2,3,4]}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toThrow(/must end with an offset string/u);
  });

  it('fails to decode OffsetTime values from arrays with non-number time fields', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1,"2","Z"]}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toThrow(/must contain number time fields/u);
  });

  it('fails to decode OffsetTime values from arrays with invalid local time fields', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[25,2,"Z"]}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toThrow(/Invalid value for HourOfDay/u);
  });

  it('fails to decode OffsetTime values from arrays with invalid offset values', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1,2,3,"bad-offset"]}',
        testSchema(JSONDecoder.default.runtime, OffsetTimeSchema),
      ),
    ).toThrow(/Invalid OffsetTime offset/u);
  });

  it('decodes LocalDateTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01T01:02:03.004"}',
        testSchema(JSONDecoder.default.runtime, LocalDateTimeSchema),
      ),
    ).toEqual({
      test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
    });
  });

  it('decodes LocalDateTime values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[2001,2,3,4,5,6,7000000]}', testSchema(decoder.runtime, LocalDateTimeSchema)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('decodes LocalDateTime values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[2001,2,3,4,5,6,7]}', testSchema(decoder.runtime, LocalDateTimeSchema)),
    ).toEqual({
      test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    });
  });

  it('fails to decode LocalDateTime values from arrays with invalid length', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[2001,2,3,4]}',
        testSchema(JSONDecoder.default.runtime, LocalDateTimeSchema),
      ),
    ).toThrow(/LocalDateTime numeric timestamps must be/u);
  });

  it('fails to decode LocalDateTime values from arrays with invalid fields', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[2001,2,3,4,5,6,-1]}',
        testSchema(JSONDecoder.default.runtime, LocalDateTimeSchema),
      ),
    ).toThrow(/Fractional component must be a non-negative integer/u);
  });

  it('decodes LocalDate values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2002-01-01"}',
        testSchema(JSONDecoder.default.runtime, LocalDateSchema),
      ),
    ).toEqual({ test: LocalDate.of(2002, 1, 1) });
  });

  it('decodes LocalDate values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[2001,2,3]}', testSchema(decoder.runtime, LocalDateSchema)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalDate values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[2001,2,3]}', testSchema(decoder.runtime, LocalDateSchema)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('fails to decode LocalDate values from arrays with invalid length', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[2001,2]}',
        testSchema(JSONDecoder.default.runtime, LocalDateSchema),
      ),
    ).toThrow(/LocalDate numeric timestamps must be/u);
  });

  it('fails to decode LocalDate values from arrays with invalid values', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[2001,13,3]}',
        testSchema(JSONDecoder.default.runtime, LocalDateSchema),
      ),
    ).toThrow(/Invalid LocalDate numeric timestamp array/u);
  });

  it('decodes LocalTime values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"01:02:03.004"}',
        testSchema(JSONDecoder.default.runtime, LocalTimeSchema),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[1,2,3,4000000]}', testSchema(decoder.runtime, LocalTimeSchema)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":[1,2,3,4]}', testSchema(decoder.runtime, LocalTimeSchema)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('fails to decode LocalTime values from arrays with invalid length', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1]}',
        testSchema(JSONDecoder.default.runtime, LocalTimeSchema),
      ),
    ).toThrow(/LocalTime numeric timestamps must be/u);
  });

  it('fails to decode LocalTime values from arrays with invalid fraction values', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":[1,2,3,-1]}',
        testSchema(JSONDecoder.default.runtime, LocalTimeSchema),
      ),
    ).toThrow(/Fractional component must be a non-negative integer/u);
  });

  it('decodes Duration values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"PT1H2M3.004S"}',
        testSchema(JSONDecoder.default.runtime, DurationSchema),
      ),
    ).toEqual({ test: Duration.parse('PT1H2M3.004S') });
  });

  it('decodes Duration values from number (decimal seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":3723.004}', testSchema(decoder.runtime, DurationSchema)),
    ).toEqual({ test: Duration.ofSeconds(3723, 4000000) });
  });

  it('decodes Duration values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":3723004}', testSchema(decoder.runtime, DurationSchema)),
    ).toEqual({ test: Duration.ofSeconds(3723, 4000000) });
  });

  it('fails to decode Duration values from invalid string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-a-duration"}',
        testSchema(JSONDecoder.default.runtime, DurationSchema),
      ),
    ).toThrow(/Invalid ISO duration/u);
  });

  it('decodes Date values from string', async () => {
    expect(
      JSONDecoder.default.decodeText(
        '{"test":"2001-02-03T04:05:06.789Z"}',
        testSchema(JSONDecoder.default.runtime, DateSchema),
      ),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from number (seconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106.789}', testSchema(decoder.runtime, DateSchema)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('decodes Date values from number (milliseconds)', async () => {
    const decoder = JSONDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      }
    )
    expect(
      decoder.decodeText('{"test":981173106789}', testSchema(decoder.runtime, DateSchema)),
    ).toEqual({
      test: new Date(Instant.ofEpochMilli(981173106789).toString()),
    });
  });

  it('fails to decode Date values from invalid string', async () => {
    expect(
      () => JSONDecoder.default.decodeText(
        '{"test":"not-a-date"}',
        testSchema(JSONDecoder.default.runtime, DateSchema),
      ),
    ).toThrow(/Invalid ISO date-time/u);
  });

  it('decodes ArrayBuffer values from Base64 encoded text', async () => {
    const bytes = new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const base64 = bytes.toBase64();

    expectEqual(
      JSONDecoder.default.decodeText(
        `{"test":"${base64}"}`,
        testSchema(JSONDecoder.default.runtime, ArrayBufferSchema),
      ),
      { test: bytes.buffer },
    );
  });

  it('decodes ArrayBuffer values from unpadded Base64 encoded text', async () => {
    const bytes = new Uint8Array([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    const base64 = bytes.toBase64({ omitPadding: true });

    expectEqual(
      JSONDecoder.default.decodeText(
        `{"test":"${base64}"}`,
        testSchema(JSONDecoder.default.runtime, ArrayBufferSchema),
      ),
      { test: bytes.buffer },
    );
  });
});
