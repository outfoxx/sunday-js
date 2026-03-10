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
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  ArrayBufferSchema,
  CBOREncoder,
  DateSchema,
  DurationSchema,
  InstantSchema,
  LocalDateSchema,
  LocalDateTimeSchema,
  LocalTimeSchema,
  OffsetDateTimeSchema,
  OffsetTimeSchema,
  SchemaLike,
  URLSchema,
  ZonedDateTimeSchema,
} from '../src';
import DateEncoding = CBOREncoder.DateEncoding;

const testSchema = <T>(runtime: CBOREncoder['runtime'], ref: SchemaLike<T>) =>
  z.object({
    test: runtime.resolveSchema(ref),
  }) as unknown as z.ZodType<{ test: T }>;

function decodeHex(hex: string) {
  return Uint8Array.fromHex(hex.replaceAll(/\s+/g, '')).buffer;
}

describe('CBOREncoder', () => {
  it('encodes object trees', () => {
    const subSchema = z.object({
      value: z.number(),
    });
    const testSchemaObj = z.object({
      test: z.string(),
      sub: subSchema,
    });

    expect(
      CBOREncoder.default.encode({ test: 'a', sub: { value: 5 } }, testSchemaObj),
    ).toHaveBytes(
      decodeHex('A2 63 737562 A1 65 76616C7565 05 64 74657374 61 61'),
    );
  });

  it('encodes ArrayBuffer values as octet string', () => {
    const bytes = new TextEncoder().encode('test');
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteLength,
    );

    expect(
      CBOREncoder.default.encode({ test: buffer }, testSchema(CBOREncoder.default.runtime, ArrayBufferSchema)),
    ).toHaveBytes(decodeHex('A1 64 74657374 44 74657374'));
  });

  it('encodes null/undefined ArrayBuffer values', () => {
    type Test = { test?: ArrayBuffer | null };
    const testSchemaObj = z.object({
      test: CBOREncoder.default.runtime.resolveSchema(ArrayBufferSchema).nullable().optional(),
    }) as z.ZodType<Test>;

    expect(CBOREncoder.default.encode({ test: null }, testSchemaObj)).toHaveBytes(
      decodeHex('A0'),
    );
  });

  it('encodes URL values as URL (tagged string)', () => {
    expect(
      CBOREncoder.default.encode(
        { test: new URL('http://example.com') },
        testSchema(CBOREncoder.default.runtime, URLSchema),
      ),
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 D8 20 73 687474703A2F2F6578616D706C652E636F6D2F',
      ),
    );
  });

  it('encodes Instant values as date (string)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
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
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
      ),
    );
  });

  it('encodes Instant values as date (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(decodeHex('A1 64 74657374 C1 FB 41CD3DC1B900E560'));
  });

  it('encodes Instant values as date (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(decodeHex('A1 64 74657374 C1 FB 41CD3DC1B900E560'));
  });

  it('encodes ZonedDateTime values as date (string)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
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
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 78 1B 323030322D30312D30315430313A30323A30332E3030345A5B5A5D',
      ),
    );
  });

  it('encodes ZonedDateTime values as date (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(decodeHex('A1 64 74657374 83 FB 41CD3DC1B900E560 61 5A 61 5A'));
  });

  it('encodes ZonedDateTime values as date (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(
      decodeHex('A1 64 74657374 83 1B 000000E472797557 61 5A 61 5A'),
    );
  });

  it('encodes OffsetDateTime values as date (string)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
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
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
      ),
    );
  });

  it('encodes OffsetDateTime values as date (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(decodeHex('A1 64 74657374 82 FB 41CD3DC1B900E560 61 5A'));
  });

  it('encodes OffsetDateTime values as date (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
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
    ).toHaveBytes(decodeHex('A1 64 74657374 82 1B 000000E472797557 61 5A'));
  });

  it('encodes OffsetTime values as string', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC) },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 6D 30313A30323A30332E3030345A'),
    );
  });

  it('encodes OffsetTime values as array (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC) },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 82 FB 40 AD 16 02 0C 49 BA 5E 61 5A'),
    );
  });

  it('encodes OffsetTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC) },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 82 1A 00 38 CE FC 61 5A'),
    );
  });

  it('encodes LocalDateTime values as string', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 77 323030322D30312D30315430313A30323A30332E303034',
      ),
    );
  });

  it('encodes LocalDateTime values as array (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000) },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 FB 41CD3DC1B900E560'));
  });

  it('encodes LocalDateTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000) },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 1B 000000E472797557'));
  });

  it('encodes LocalDate values as string', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: LocalDate.of(2002, 1, 1) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 6A 323030322D30312D3031'));
  });

  it('encodes LocalDate values as array (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 1A 3A 7B 4A 00'));
  });

  it('encodes LocalDate values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 1B 00 00 00 E4 71 99 10 00'));
  });

  it('encodes LocalTime values as string', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 6C 30313A30323A30332E303034'),
    );
  });

  it('encodes LocalTime values as array (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 FB 40 AD 16 02 0C 49 BA 5E'),
    );
  });

  it('encodes LocalTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 1A 00 38 CE FC'),
    );
  });

  it('encodes Duration values as strings', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 6C 50543148324D332E30303453'),
    );
  });

  it('encodes Duration values as number (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 FB 40 AD 16 02 0C 49 BA 5E'),
    );
  });

  it('encodes Duration values as number (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    expect(
      encoder.encode(
        { test: Duration.ofSeconds(3723, 4000000) },
        testSchema(encoder.runtime, DurationSchema),
      ),
    ).toHaveBytes(
      decodeHex('A1 64 74657374 1A 00 38 CE FC'),
    );
  });

  it('encodes Date values as ISO date (tagged string)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    expect(
      encoder.encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSchema(encoder.runtime, DateSchema),
      ),
    ).toHaveBytes(
      decodeHex(
        'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A',
      ),
    );
  });

  it('encodes Date values as epoch date (tagged float)', async () => {
    expect(
      CBOREncoder.default.encode(
        { test: new Date(Instant.ofEpochMilli(981173106789).toString()) },
        testSchema(CBOREncoder.default.runtime, DateSchema),
      ),
    ).toHaveBytes(decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'));
  });
});
