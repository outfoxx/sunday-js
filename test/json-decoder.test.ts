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
