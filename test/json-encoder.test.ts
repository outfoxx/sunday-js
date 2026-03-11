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
} from '@js-joda/core';
import { z } from 'zod';
import {
  ArrayBufferSchema,
  DateSchema,
  DurationSchema,
  InstantSchema,
  JSONEncoder,
  LocalDateSchema,
  LocalDateTimeSchema,
  LocalTimeSchema,
  OffsetDateTimeSchema,
  OffsetTimeSchema,
  SchemaLike,
  URLSchema,
  ZonedDateTimeSchema,
} from '../src';
import DateEncoding = JSONEncoder.DateEncoding;

const testSchema = <T>(runtime: JSONEncoder['runtime'], ref: SchemaLike<T>) =>
  z.object({
    test: runtime.resolveSchema(ref),
  }) as unknown as z.ZodType<{ test: T }>;

describe('JSONEncoder', () => {
  it('encodes object trees', () => {
    const subSchema = z.object({
      value: z.number(),
    });
    const testSchemaObj = z.object({
      test: z.string(),
      sub: subSchema,
    });

    expect(
      JSONEncoder.default.encode({ test: 'a', sub: { value: 5 } }, testSchemaObj),
    ).toBe('{"test":"a","sub":{"value":5}}');
  });

  it('encodes URL values as strings', () => {
    expect(
      JSONEncoder.default.encode(
        { test: new URL('http://example.com') },
        testSchema(JSONEncoder.default.runtime, URLSchema),
      ),
    ).toEqual('{"test":"http://example.com/"}');
  });

  it('encodes Instant values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, InstantSchema),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes Instant values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, InstantSchema),
      ),
    ).toEqual('{"test":981173106.007}');
  });

  it('encodes Instant values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, InstantSchema),
      ),
    ).toEqual('{"test":981173106007}');
  });

  it('encodes ZonedDateTime values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z[Z]"}');
  });

  it('encodes ZonedDateTime values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual('{"test":981173106.007}');
  });

  it('encodes ZonedDateTime values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual('{"test":981173106007}');
  });

  it('encodes OffsetDateTime values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004Z"}');
  });

  it('encodes OffsetDateTime values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual('{"test":981173106.007}');
  });

  it('encodes OffsetDateTime values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
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
        testSchema(encoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual('{"test":981173106007}');
  });

  it('encodes OffsetTime values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual('{"test":"01:02:03.004Z"}');
  });

  it('encodes OffsetTime values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual('{"test":[1,2,3,4000000,"Z"]}');
  });

  it('encodes OffsetTime values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        {
          test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
        },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual('{"test":[1,2,3,4,"Z"]}');
  });

  it('encodes LocalDateTime values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        {
          test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
        },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual('{"test":"2002-01-01T01:02:03.004"}');
  });

  it('encodes LocalDateTime values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        {
          test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
        },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual('{"test":[2001,2,3,4,5,6,7000000]}');
  });

  it('encodes LocalDateTime values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        {
          test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
        },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual('{"test":[2001,2,3,4,5,6,7]}');
  });

  it('encodes LocalDate values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: LocalDate.of(2002, 1, 1) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toEqual('{"test":"2002-01-01"}');
  });

  it('encodes LocalDate values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toEqual('{"test":[2001,2,3]}');
  });

  it('encodes LocalDate values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toEqual('{"test":[2001,2,3]}');
  });

  it('encodes LocalTime values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toEqual('{"test":"01:02:03.004"}');
  });

  it('encodes LocalTime values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toEqual('{"test":[1,2,3,4000000]}');
  });

  it('encodes LocalTime values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toEqual('{"test":[1,2,3,4]}');
  });

  it('encodes Duration values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toEqual('{"test":"PT1H2M3.004S"}');
  });

  it('encodes Duration values as number (decimal seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toEqual('{"test":3723.004}');
  });

  it('encodes Duration values as number (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toEqual('{"test":3723004}');
  });

  it('uses Jackson-style timestamp defaults for local date-time and duration', async () => {
    expect(
      JSONEncoder.default.encode(
        { test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000) },
        testSchema(JSONEncoder.default.runtime, LocalDateTimeSchema),
      ),
    ).toEqual('{"test":[2001,2,3,4,5,6,7000000]}');

    expect(
      JSONEncoder.default.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(JSONEncoder.default.runtime, DurationSchema),
      ),
    ).toEqual('{"test":3723.004}');
  });

  it('encodes Date values as strings', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSchema(encoder.runtime, DateSchema),
      ),
    ).toEqual('{"test":"2001-02-03T04:05:06.789Z"}');
  });

  it('encodes Date values as numbers (seconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSchema(encoder.runtime, DateSchema),
      ),
    ).toEqual('{"test":981173106.789}');
  });

  it('encodes Date values as numbers (milliseconds)', async () => {
    const encoder = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSchema(encoder.runtime, DateSchema),
      ),
    ).toEqual('{"test":981173106789}');
  });

  it('encodes ArrayBuffer values as Base64', () => {
    expect(
      JSONEncoder.default.encode({ test: new ArrayBuffer(5) }, testSchema(JSONEncoder.default.runtime, ArrayBufferSchema)),
    ).toEqual('{"test":"AAAAAAA"}');
  });

  it('excludes null & undefined values by default when encoding', () => {
    type Test = { test?: ArrayBuffer | null };
    const testSchemaObj = z.object({
      test: JSONEncoder.default.runtime.resolveSchema(ArrayBufferSchema).nullable().optional(),
    }) as z.ZodType<Test>;

    expect(JSONEncoder.default.encode({ test: undefined }, testSchemaObj)).toEqual(
      '{}',
    );

    expect(JSONEncoder.default.encode({ test: null }, testSchemaObj)).toEqual(
      '{}',
    );
  });

  it('includes null values when encoding configured', () => {
    type Test = { test?: ArrayBuffer | null };
    const testSchemaObj = z.object({
      test: JSONEncoder.default.runtime.resolveSchema(ArrayBufferSchema).nullable().optional(),
    }) as z.ZodType<Test>;

    expect(
      JSONEncoder.default.encode({ test: undefined }, testSchemaObj, true),
    ).toEqual('{}');

    expect(JSONEncoder.default.encode({ test: null }, testSchemaObj, true)).toEqual(
      '{"test":null}',
    );
  });

  it('prunes null object properties recursively but preserves null array elements', () => {
    expect(
      JSONEncoder.default.encode({
        nested: {
          remove: null,
          keep: 1,
        },
        list: [null, { remove: null, keep: 'ok' }],
      }),
    ).toEqual('{"nested":{"keep":1},"list":[null,{"keep":"ok"}]}');
  });
});
