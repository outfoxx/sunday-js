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
import { CBOR, TaggedValue } from 'cbor-redux';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  ArrayBufferEncoding,
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

  it('encodes URL values as tagged URI string', () => {
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

  it('encodes Instant values as tagged string', async () => {
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

  it('encodes Instant values as tagged number (decimal seconds)', async () => {
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

  it('encodes Instant values as untagged number (milliseconds)', async () => {
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
    ).toHaveBytes(decodeHex('A1 64 74657374 1B 000000E472797557'));
  });

  it('encodes ZonedDateTime values as date (string)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    const encoded = encoder.encode(
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
    );
    const wire = CBOR.decode(encoded) as { test: TaggedValue };
    expect(wire.test).toBeInstanceOf(TaggedValue);
    expect(wire.test.tag).toBe(0);
    expect(wire.test.value).toBe('2002-01-01T01:02:03.004Z[Z]');
  });

  it('encodes ZonedDateTime values as date (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    const encoded = encoder.encode(
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
    );
    const wire = CBOR.decode(encoded) as { test: TaggedValue };
    expect(wire.test).toBeInstanceOf(TaggedValue);
    expect(wire.test.tag).toBe(1);
    expect(wire.test.value).toBe(981173106.007);
  });

  it('encodes ZonedDateTime values as date (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const encoded = encoder.encode(
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
    );
    const wire = CBOR.decode(encoded) as { test: number };
    expect(wire.test).toBe(981173106007);
  });

  it('encodes OffsetDateTime values as tagged string', async () => {
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

  it('encodes OffsetDateTime values as tagged number (decimal seconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    const encoded = encoder.encode(
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
    );
    const wire = CBOR.decode(encoded) as { test: TaggedValue };
    expect(wire.test).toBeInstanceOf(TaggedValue);
    expect(wire.test.tag).toBe(1);
    expect(wire.test.value).toBe(981173106.007);
  });

  it('encodes OffsetDateTime values as untagged number (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const encoded = encoder.encode(
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
    );
    const wire = CBOR.decode(encoded) as { test: number };
    expect(wire.test).toBe(981173106007);
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
    const wire = CBOR.decode(
      encoder.encode(
        { test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC) },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([1, 2, 3, 4000000, 'Z']);
  });

  it('encodes OffsetTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const wire = CBOR.decode(
      encoder.encode(
        { test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC) },
        testSchema(encoder.runtime, OffsetTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([1, 2, 3, 4, 'Z']);
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
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000) },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([2001, 2, 3, 4, 5, 6, 7000000]);
  });

  it('encodes LocalDateTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000) },
        testSchema(encoder.runtime, LocalDateTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([2001, 2, 3, 4, 5, 6, 7]);
  });

  it('encodes LocalDate values as ISO string (ISO8601 policy)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.ISO8601 });
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalDate.of(2002, 1, 1) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ) as { test: string };
    expect(wire.test).toBe('2002-01-01');
  });

  it('encodes LocalDate values as numeric array (DECIMAL_SECONDS policy)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH });
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([2001, 2, 3]);
  });

  it('encodes LocalDate values as numeric array (MILLISECONDS policy)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalDate.of(2001, 2, 3) },
        testSchema(encoder.runtime, LocalDateSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([2001, 2, 3]);
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
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([1, 2, 3, 4000000]);
  });

  it('encodes LocalTime values as array (milliseconds)', async () => {
    const encoder = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH });
    const wire = CBOR.decode(
      encoder.encode(
        { test: LocalTime.of(1, 2, 3, 4000000) },
        testSchema(encoder.runtime, LocalTimeSchema),
      ),
    ) as { test: unknown[] };
    expect(wire.test).toEqual([1, 2, 3, 4]);
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

  it('encodes ArrayBuffer textual values as tagged base64', () => {
    const encoder = CBOREncoder.fromPolicy({ arrayBufferEncoding: ArrayBufferEncoding.BASE64 });
    const bytes = Uint8Array.from([0, 1, 2, 3, 251, 255, 64, 65]).buffer;
    const wire = CBOR.decode(encoder.encode({ test: bytes }, testSchema(encoder.runtime, ArrayBufferSchema))) as {
      test: TaggedValue;
    };
    expect(wire.test).toBeInstanceOf(TaggedValue);
    expect(wire.test.tag).toBe(34);
    expect(wire.test.value).toBe('AAECA/v/QEE');
  });

  it('encodes ArrayBuffer textual values as tagged base64url', () => {
    const encoder = CBOREncoder.fromPolicy({ arrayBufferEncoding: ArrayBufferEncoding.BASE64URL });
    const bytes = Uint8Array.from([0, 1, 2, 3, 251, 255, 64, 65]).buffer;
    const wire = CBOR.decode(encoder.encode({ test: bytes }, testSchema(encoder.runtime, ArrayBufferSchema))) as {
      test: TaggedValue;
    };
    expect(wire.test).toBeInstanceOf(TaggedValue);
    expect(wire.test.tag).toBe(33);
    expect(wire.test.value).toBe('AAECA_v_QEE');
  });
});
