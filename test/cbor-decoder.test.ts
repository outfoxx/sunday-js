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
import { beforeEach, describe, expect, it } from 'bun:test';
import fetchMock from 'fetch-mock';
import { z } from 'zod';
import {
  ArrayBufferEncoding,
  ArrayBufferSchema,
  CBORDecoder,
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
import { expectEqual } from './expect-utils';
import NumericDateDecoding = CBORDecoder.NumericDateDecoding;

const testSchema = <T>(runtime: CBORDecoder['runtime'], ref: SchemaLike<T>) =>
  z.object({
             test: runtime.resolveSchema(ref),
           }) as unknown as z.ZodType<{ test: T }>;

function decodeHex(hex: string) {
  return Uint8Array.fromHex(hex.replaceAll(/\s+/g, '')).buffer;
}

function encodeCbor(value: unknown): ArrayBuffer {
  return CBOR.encode(value);
}

describe('CBORDecoder', () => {
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

    fetchMock.getOnce(
      'http://example.com',
      new Response(
        decodeHex('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
      ),
    );
    expect(
      CBORDecoder.default.decode(await fetch('http://example.com'), testSchemaObj),
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
      CBORDecoder.default.decodeBuffer(
        decodeHex('A2 64 74657374 61 61 63 737562 A1 65 76616C7565 05'),
        testSchemaObj,
      ),
    ).toEqual({ test: 'a', sub: { value: 5 } });
  });

  it('decodes URL values from string', async () => {
    expectEqual(
      CBORDecoder.default.decodeBuffer(
        decodeHex('A1 64 74657374 73 687474703A2F2F6578616D706C652E636F6D2F'),
        testSchema(CBORDecoder.default.runtime, URLSchema),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('decodes URL values from tagged URL', async () => {
    const decoder = CBORDecoder.default;
    expectEqual(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 D8 20 72 687474703A2F2F6578616D706C652E636F6D',
        ),
        testSchema(decoder.runtime, URLSchema),
      ),
      { test: new URL('http://example.com') },
    );
  });

  it('fails to decode URL values from unsupported tagged URL', async () => {
    const decoder = CBORDecoder.default;
    expect(() => decoder.decodeBuffer(
      encodeCbor({ test: new TaggedValue('http://example.com', 999) }),
      testSchema(decoder.runtime, URLSchema),
    )).toThrow(/Invalid tag for URL/u);
  });

  it('decodes Instant values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSchema(decoder.runtime, InstantSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
              });
  });

  it('decodes Instant values from date tagged string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSchema(decoder.runtime, InstantSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC).toInstant(),
              });
  });

  it('decodes Instant values from number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 FB 41CD3DC1B964FDF4'),
                     testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
              });
  });

  it('decodes Instant values from date tagged number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, InstantSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
              });
  });

  it('decodes Instant values from number (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 1B 000000E472797865'),
                     testSchema(decoder.runtime, InstantSchema)),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
              });
  });

  it('decodes Instant values from date tagged number (epoch seconds under milliseconds policy)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, InstantSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC).toInstant(),
              });
  });

  it('fails to decode Instant values from unsupported date tag', async () => {
    expect(() =>
             CBORDecoder.default.decodeBuffer(
               decodeHex('A1 64 74657374 C2 00'),
               testSchema(CBORDecoder.default.runtime, InstantSchema),
             )).toThrow(/Invalid CBOR tag for temporal decoding/u);
  });

  it('fails to decode Instant values from tag 0 with non-string payload', async () => {
    expect(() =>
      CBORDecoder.default.decodeBuffer(
        encodeCbor({ test: new TaggedValue(123, 0) }),
        testSchema(CBORDecoder.default.runtime, InstantSchema),
      ),
    ).toThrow(/CBOR tag 0 must contain a string datetime/u);
  });

  it('fails to decode Instant values from tag 1 with non-number payload', async () => {
    expect(() =>
      CBORDecoder.default.decodeBuffer(
        encodeCbor({ test: new TaggedValue('not-a-number', 1) }),
        testSchema(CBORDecoder.default.runtime, InstantSchema),
      ),
    ).toThrow(/CBOR tag 1 must contain epoch-seconds/u);
  });

  it('decodes ZonedDateTime values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 78 1B 323030322D30312D30315430313A30323A30332E3030345A5B5A5D',
        ),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
              });
  });

  it('decodes ZonedDateTime values from date tagged string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 C0 78 1B 323030322D30312D30315430313A30323A30332E3030345A5B5A5D',
        ),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneId.UTC),
              });
  });

  it('decodes ZonedDateTime values from number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 FB 41CD3DC1B900E560'),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
              });
  });

  it('decodes ZonedDateTime values from date tagged number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC),
              });
  });

  it('decodes ZonedDateTime values from number (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 1B 000000E472797557'),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
              });
  });

  it('decodes ZonedDateTime values from date tagged number (epoch seconds under milliseconds policy)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, ZonedDateTimeSchema),
      ),
    ).toEqual({
                test: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneId.UTC),
              });
  });

  it('fails to decode ZonedDateTime values from unsupported date tag', async () => {
    expect(() =>
      CBORDecoder.default.decodeBuffer(
        encodeCbor({ test: new TaggedValue(0, 2) }),
        testSchema(CBORDecoder.default.runtime, ZonedDateTimeSchema),
      ),
    ).toThrow(/Invalid CBOR tag for temporal decoding/u);
  });

  it('decodes OffsetDateTime values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetDateTime values from date tagged string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 C0 78 18 323030322D30312D30315430313A30323A30332E3030345A',
        ),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2002, 1, 1, 1, 2, 3, 4000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetDateTime values from number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 FB 41CD3DC1B900E560'),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetDateTime values from date tagged number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetDateTime values from number (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 1B 000000E472797557'),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetDateTime values from date tagged number (epoch seconds under milliseconds policy)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, OffsetDateTimeSchema),
      ),
    ).toEqual({
                test: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 789000000, ZoneOffset.UTC),
              });
  });

  it('fails to decode OffsetDateTime values from unsupported date tag', async () => {
    expect(() =>
      CBORDecoder.default.decodeBuffer(
        encodeCbor({ test: new TaggedValue(0, 2) }),
        testSchema(CBORDecoder.default.runtime, OffsetDateTimeSchema),
      ),
    ).toThrow(/Invalid CBOR tag for temporal decoding/u);
  });

  it('decodes OffsetTime values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 6D 30313A30323A30332E3030345A'),
        testSchema(decoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual({
                test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetTime values from array (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        encodeCbor({ test: [1, 2, 3, 4000000, 'Z'] }),
        testSchema(decoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual({
                test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
              });
  });

  it('decodes OffsetTime values from array (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        encodeCbor({ test: [1, 2, 3, 4, 'Z'] }),
        testSchema(decoder.runtime, OffsetTimeSchema),
      ),
    ).toEqual({
                test: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
              });
  });

  it('decodes LocalDateTime values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 77 323030322D30312D30315430313A30323A30332E303034'),
        testSchema(decoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual({
                test: LocalDateTime.of(2002, 1, 1, 1, 2, 3, 4000000),
              });
  });

  it('decodes LocalDateTime values from array (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        encodeCbor({ test: [2001, 2, 3, 4, 5, 6, 789000000] }),
        testSchema(decoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual({
                test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000),
              });
  });

  it('decodes LocalDateTime values from array (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        encodeCbor({ test: [2001, 2, 3, 4, 5, 6, 789] }),
        testSchema(decoder.runtime, LocalDateTimeSchema),
      ),
    ).toEqual({
                test: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 789000000),
              });
  });

  it('decodes LocalDate values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 6A 323030322D30312D3031'),
        testSchema(decoder.runtime, LocalDateSchema),
      ),
    ).toEqual({ test: LocalDate.of(2002, 1, 1) });
  });

  it('decodes LocalDate values from array (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(encodeCbor({ test: [2001, 2, 3] }), testSchema(decoder.runtime, LocalDateSchema)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalDate values from array (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(encodeCbor({ test: [2001, 2, 3] }), testSchema(decoder.runtime, LocalDateSchema)),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('decodes LocalDate values from epoch-day tag', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 D8 64 19 2C 5C'),
        testSchema(decoder.runtime, LocalDateSchema),
      ),
    ).toEqual({ test: LocalDate.of(2001, 2, 3) });
  });

  it('fails to decode LocalDate values from unsupported tag', async () => {
    const decoder = CBORDecoder.default;
    expect(() =>
      decoder.decodeBuffer(
        encodeCbor({ test: new TaggedValue(11356, 0) }),
        testSchema(decoder.runtime, LocalDateSchema),
      ),
    ).toThrow(/Invalid CBOR tag for LocalDate decoding/u);
  });

  it('fails to decode LocalDate values from non-integer epoch-day tag payload', async () => {
    const decoder = CBORDecoder.default;
    expect(() =>
      decoder.decodeBuffer(
        encodeCbor({ test: new TaggedValue(1.5, 100) }),
        testSchema(decoder.runtime, LocalDateSchema),
      ),
    ).toThrow(/CBOR tag 100 must contain an integer epoch-day/u);
  });

  it('decodes LocalTime values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 6C 30313A30323A30332E303034'),
        testSchema(decoder.runtime, LocalTimeSchema),
      ),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from array (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(encodeCbor({ test: [1, 2, 3, 4000000] }), testSchema(decoder.runtime, LocalTimeSchema)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes LocalTime values from array (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(encodeCbor({ test: [1, 2, 3, 4] }), testSchema(decoder.runtime, LocalTimeSchema)),
    ).toEqual({ test: LocalTime.of(1, 2, 3, 4000000) });
  });

  it('decodes Duration values from string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 6C 50543148324D332E30303453'),
        testSchema(decoder.runtime, DurationSchema),
      ),
    ).toEqual({ test: Duration.ofSeconds(3723, 4000000) });
  });

  it('decodes Duration values from number (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 FB 40AD16020C49BA5E'),
                           testSchema(decoder.runtime, DurationSchema)),
    ).toEqual({ test: Duration.ofSeconds(3723, 4000000) });
  });

  it('decodes Duration values from number (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 1A 0038CEFC'),
                           testSchema(decoder.runtime, DurationSchema)),
    ).toEqual({ test: Duration.ofSeconds(3723, 4000000) });
  });

  it('decodes Date values from ISO string', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        testSchema(decoder.runtime, DateSchema),
      ),
    ).toEqual({
                test: new Date(Instant.ofEpochMilli(981173106789).toString()),
              });
  });

  it('decodes Date values from ISO date', async () => {
    const decoder = CBORDecoder.default;
    expect(
      decoder.decodeBuffer(
        decodeHex(
          'A1 64 74657374 C0 78 18 323030312D30322D30335430343A30353A30362E3738395A',
        ),
        testSchema(decoder.runtime, DateSchema),
      ),
    ).toEqual({
                test: new Date(Instant.ofEpochMilli(981173106789).toString()),
              });
  });

  it('decodes Date values from numeric epoch (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 FB 41CD3DC1B964FDF4'),
                           testSchema(decoder.runtime, DateSchema)),
    ).toEqual({
                test: new Date(Instant.ofEpochMilli(981173106789).toString()),
              });
  });

  it('decodes Date values from numeric epoch (milliseconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(decodeHex('A1 64 74657374 1B 000000E472797865'),
                           testSchema(decoder.runtime, DateSchema)),
    ).toEqual({
                test: new Date(Instant.ofEpochMilli(981173106789).toString()),
              });
  });

  it('decodes Date values from epoch date (decimal seconds)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, DateSchema),
      ),
    ).toEqual(
      {
        test: new Date(Instant.ofEpochMilli(981173106789).toString()),
      },
    );
  });

  it('decodes Date values from epoch date (epoch seconds under milliseconds policy)', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH,
      },
    );
    expect(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 C1 FB 41CD3DC1B964FDF4'),
        testSchema(decoder.runtime, DateSchema),
      ),
    ).toEqual(
      {
        test: new Date(Instant.ofEpochMilli(981173106789).toString()),
      },
    );
  });

  it('fails to decode Date values from unsupported date tag', async () => {
    expect(() =>
      CBORDecoder.default.decodeBuffer(
        encodeCbor({ test: new TaggedValue(0, 2) }),
        testSchema(CBORDecoder.default.runtime, DateSchema),
      ),
    ).toThrow(/Invalid CBOR tag for temporal decoding/u);
  });

  it('decodes ArrayBuffer values from base64 string', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
        arrayBufferEncoding: ArrayBufferEncoding.BASE64,
      },
    );
    expectEqual(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 D8 21 70 534756736247386751304A5055694568'),
        testSchema(decoder.runtime, ArrayBufferSchema),
      ),
      { test: new TextEncoder().encode('Hello CBOR!!').buffer },
    );
  });

  it('decodes ArrayBuffer values from padded and unpadded base64 tagged strings', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
        arrayBufferEncoding: ArrayBufferEncoding.BASE64,
      },
    );

    expectEqual(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 D8 22 64 41513D3D'),
        testSchema(decoder.runtime, ArrayBufferSchema),
      ),
      { test: Uint8Array.from([1]).buffer },
    );

    expectEqual(
      decoder.decodeBuffer(
        decodeHex('A1 64 74657374 D8 22 62 4151'),
        testSchema(decoder.runtime, ArrayBufferSchema),
      ),
      { test: Uint8Array.from([1]).buffer },
    );
  });

  it('fails to decode ArrayBuffer values from unsupported binary text tag', async () => {
    const decoder = CBORDecoder.fromPolicy(
      {
        numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
        arrayBufferEncoding: ArrayBufferEncoding.BASE64,
      },
    );
    expect(() =>
      decoder.decodeBuffer(
        encodeCbor({ test: new TaggedValue('AQ', 99) }),
        testSchema(decoder.runtime, ArrayBufferSchema),
      ),
    ).toThrow();
  });
});
