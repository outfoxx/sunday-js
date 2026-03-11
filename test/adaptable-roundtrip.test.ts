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

import { describe, expect, it } from 'bun:test';
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
import { z } from 'zod';
import {
  ArrayBufferEncoding,
  ArrayBufferSchema,
  CBORDecoder,
  CBOREncoder,
  DateEncoding,
  DateSchema,
  DurationSchema,
  InstantSchema,
  JSONDecoder,
  JSONEncoder,
  LocalDateSchema,
  LocalDateTimeSchema,
  LocalTimeSchema,
  NumericDateDecoding,
  OffsetDateTimeSchema,
  OffsetTimeSchema,
  SchemaLike,
  SchemaRuntime,
  ZonedDateTimeSchema,
} from '../src';
import {
  base64Tag,
  base64UrlTag,
  epochDateTimeTag,
  isoDateTimeTag
} from '../src/media-type-codecs/cbor-tags';
import { expectEqual } from './expect-utils';

type Nested<T> = {
  container: {
    value: T;
  };
  list: T[];
};

type TemporalCase = {
  name: string;
  schema: SchemaLike;
  value: unknown;
  assertJsonWireShape: (wire: unknown, dateEncoding: DateEncoding) => void;
  assertCborWireShape: (wire: unknown, dateEncoding: DateEncoding) => void;
};

function nestedSchema<T>(runtime: SchemaRuntime, ref: SchemaLike<T>): z.ZodType<Nested<T>> {
  const resolved = runtime.resolveSchema(ref);
  return z.object({
    container: z.object({
      value: resolved,
    }),
    list: z.array(resolved),
  }) as unknown as z.ZodType<Nested<T>>;
}

function encodingName(encoding: DateEncoding): string {
  switch (encoding) {
    case DateEncoding.ISO8601:
      return 'ISO8601';
    case DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH:
      return 'DECIMAL_SECONDS_SINCE_EPOCH';
    case DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return 'MILLISECONDS_SINCE_EPOCH';
  }
}

function matchingNumericDateDecoding(encoding: DateEncoding): NumericDateDecoding {
  return encoding === DateEncoding.MILLISECONDS_SINCE_EPOCH
    ? NumericDateDecoding.MILLISECONDS_SINCE_EPOCH
    : NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH;
}

function assertString(value: unknown): void {
  expect(typeof value).toBe('string');
}

function assertNumber(value: unknown): void {
  expect(typeof value).toBe('number');
}

function assertNumberArray(value: unknown, length?: number): void {
  expect(Array.isArray(value)).toBe(true);
  const tuple = value as unknown[];
  if (length !== undefined) {
    expect(tuple).toHaveLength(length);
  }
  for (const item of tuple) {
    expect(typeof item).toBe('number');
  }
}

function assertOffsetTimeArray(value: unknown): void {
  expect(Array.isArray(value)).toBe(true);
  const tuple = value as unknown[];
  expect(tuple.length).toBeGreaterThanOrEqual(3);
  expect(tuple.length).toBeLessThanOrEqual(5);
  expect(typeof tuple.at(-1)).toBe('string');
  for (const item of tuple.slice(0, -1)) {
    expect(typeof item).toBe('number');
  }
}

function base64String(value: ArrayBuffer, encoding: ArrayBufferEncoding): string {
  const bytes = new Uint8Array(value);
  switch (encoding) {
    case ArrayBufferEncoding.BASE64:
      return bytes.toBase64({ alphabet: 'base64', omitPadding: true });
    case ArrayBufferEncoding.BASE64URL:
      return bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
    default:
      throw new Error(`Unsupported text encoding: ${encoding}`);
  }
}

function assertCborArrayBufferWireShape(
  wire: unknown,
  original: ArrayBuffer,
  arrayBufferEncoding: ArrayBufferEncoding,
): void {
  if (arrayBufferEncoding === ArrayBufferEncoding.RAW_BYTES) {
    const bufferValue = wire instanceof Uint8Array
      ? wire.buffer.slice(wire.byteOffset, wire.byteOffset + wire.byteLength)
      : wire;
    expect(
      bufferValue instanceof ArrayBuffer,
      'Expected RAW_BYTES wire value to be ArrayBuffer or Uint8Array',
    ).toBe(true);
    expectEqual(bufferValue, original);
    return;
  }

  expect(wire).toBeInstanceOf(TaggedValue);
  const tagged = wire as TaggedValue;
  expect(tagged.tag).toBe(
    arrayBufferEncoding === ArrayBufferEncoding.BASE64 ? base64Tag : base64UrlTag,
  );
  expect(typeof tagged.value).toBe('string');
  expect(tagged.value).toBe(base64String(original, arrayBufferEncoding));
}

const temporalCases: TemporalCase[] = [
  {
    name: 'Instant',
    schema: InstantSchema,
    value: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC).toInstant(),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(isoDateTimeTag);
        assertString(tagged.value);
      } else if (dateEncoding === DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(epochDateTimeTag);
        assertNumber(tagged.value);
      } else {
        assertNumber(wire);
      }
    },
  },
  {
    name: 'ZonedDateTime',
    schema: ZonedDateTimeSchema,
    value: ZonedDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneId.UTC),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(isoDateTimeTag);
        assertString(tagged.value);
      } else if (dateEncoding === DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(epochDateTimeTag);
        assertNumber(tagged.value);
      } else {
        assertNumber(wire);
      }
    },
  },
  {
    name: 'OffsetDateTime',
    schema: OffsetDateTimeSchema,
    value: OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(isoDateTimeTag);
        assertString(tagged.value);
      } else if (dateEncoding === DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(epochDateTimeTag);
        assertNumber(tagged.value);
      } else {
        assertNumber(wire);
      }
    },
  },
  {
    name: 'OffsetTime',
    schema: OffsetTimeSchema,
    value: OffsetTime.of(1, 2, 3, 4000000, ZoneOffset.UTC),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertOffsetTimeArray(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertOffsetTimeArray(wire);
      }
    },
  },
  {
    name: 'LocalDateTime',
    schema: LocalDateTimeSchema,
    value: LocalDateTime.of(2001, 2, 3, 4, 5, 6, 7000000),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire);
      }
    },
  },
  {
    name: 'LocalDate',
    schema: LocalDateSchema,
    value: LocalDate.of(2001, 2, 3),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire, 3);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire, 3);
      }
    },
  },
  {
    name: 'LocalTime',
    schema: LocalTimeSchema,
    value: LocalTime.of(1, 2, 3, 4000000),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumberArray(wire);
      }
    },
  },
  {
    name: 'Duration',
    schema: DurationSchema,
    value: Duration.ofSeconds(3723, 4000000),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
  },
  {
    name: 'Date',
    schema: DateSchema,
    value: new Date(Instant.ofEpochMilli(981173106789).toString()),
    assertJsonWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        assertString(wire);
      } else {
        assertNumber(wire);
      }
    },
    assertCborWireShape: (wire, dateEncoding) => {
      if (dateEncoding === DateEncoding.ISO8601) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(isoDateTimeTag);
        assertString(tagged.value);
      } else if (dateEncoding === DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH) {
        expect(wire).toBeInstanceOf(TaggedValue);
        const tagged = wire as TaggedValue;
        expect(tagged.tag).toBe(epochDateTimeTag);
        assertNumber(tagged.value);
      } else {
        assertNumber(wire);
      }
    },
  },
];

describe('adaptable type roundtrip and policy-driven encoding', () => {
  describe('ArrayBuffer settings', () => {
    const value = Uint8Array.from([0, 1, 2, 3, 251, 255, 64, 65]).buffer;

    for (const arrayBufferEncoding of [
      ArrayBufferEncoding.BASE64,
      ArrayBufferEncoding.BASE64URL,
    ]) {
      it(`JSON encodes and roundtrips top-level and nested ArrayBuffer with ${ArrayBufferEncoding[arrayBufferEncoding]}`, () => {
        const encoder = JSONEncoder.fromPolicy({ arrayBufferEncoding });
        const decoder = JSONDecoder.fromPolicy({ arrayBufferEncoding });
        const expectedText = base64String(value, arrayBufferEncoding);

        const topEncoded = encoder.encode(value, ArrayBufferSchema);
        const topWire = JSON.parse(topEncoded);
        expect(topWire).toBe(expectedText);
        expectEqual(decoder.decodeText(topEncoded, ArrayBufferSchema), value);

        const nestedValue: Nested<ArrayBuffer> = {
          container: { value },
          list: [value],
        };
        const nestedEncodeSchema = nestedSchema(encoder.runtime, ArrayBufferSchema);
        const nestedDecodeSchema = nestedSchema(decoder.runtime, ArrayBufferSchema);
        const nestedEncoded = encoder.encode(nestedValue, nestedEncodeSchema);
        const nestedWire = JSON.parse(nestedEncoded);

        expect(nestedWire.container.value).toBe(expectedText);
        expect(nestedWire.list[0]).toBe(expectedText);
        expectEqual(
          decoder.decodeText(nestedEncoded, nestedDecodeSchema),
          nestedValue,
        );
      });
    }

    for (const arrayBufferEncoding of [
      ArrayBufferEncoding.RAW_BYTES,
      ArrayBufferEncoding.BASE64,
      ArrayBufferEncoding.BASE64URL,
    ]) {
      it(`CBOR encodes and roundtrips top-level and nested ArrayBuffer with ${ArrayBufferEncoding[arrayBufferEncoding]}`, () => {
        const encoder = CBOREncoder.fromPolicy({ arrayBufferEncoding });
        const decoder = CBORDecoder.fromPolicy({ arrayBufferEncoding });

        const topEncoded = encoder.encode(value, ArrayBufferSchema);
        const topWire = CBOR.decode(topEncoded);
        assertCborArrayBufferWireShape(topWire, value, arrayBufferEncoding);
        expectEqual(decoder.decodeBuffer(topEncoded, ArrayBufferSchema), value);

        const nestedValue: Nested<ArrayBuffer> = {
          container: { value },
          list: [value],
        };
        const nestedEncodeSchema = nestedSchema(encoder.runtime, ArrayBufferSchema);
        const nestedDecodeSchema = nestedSchema(decoder.runtime, ArrayBufferSchema);
        const nestedEncoded = encoder.encode(nestedValue, nestedEncodeSchema);
        const nestedWire = CBOR.decode(nestedEncoded) as {
          container: { value: unknown };
          list: unknown[];
        };

        assertCborArrayBufferWireShape(
          nestedWire.container.value,
          value,
          arrayBufferEncoding,
        );
        assertCborArrayBufferWireShape(
          nestedWire.list[0],
          value,
          arrayBufferEncoding,
        );
        expectEqual(
          decoder.decodeBuffer(nestedEncoded, nestedDecodeSchema),
          nestedValue,
        );
      });
    }
  });

  describe('Temporal types by format and settings', () => {
    const dateEncodings = [
      DateEncoding.ISO8601,
      DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
      DateEncoding.MILLISECONDS_SINCE_EPOCH,
    ];

    for (const temporalCase of temporalCases) {
      for (const dateEncoding of dateEncodings) {
        const encodingLabel = encodingName(dateEncoding);

        it(`JSON ${temporalCase.name} top-level and nested roundtrip with ${encodingLabel} shape`, () => {
          const numericDateDecoding = matchingNumericDateDecoding(dateEncoding);
          const encoder = JSONEncoder.fromPolicy({ dateEncoding });
          const decoder = JSONDecoder.fromPolicy({ numericDateDecoding });

          const topEncoded = encoder.encode(temporalCase.value, temporalCase.schema);
          const topWire = JSON.parse(topEncoded);
          temporalCase.assertJsonWireShape(topWire, dateEncoding);
          expectEqual(
            decoder.decodeText(topEncoded, temporalCase.schema),
            temporalCase.value,
          );

          const nestedValue: Nested<unknown> = {
            container: { value: temporalCase.value },
            list: [temporalCase.value],
          };
          const nestedEncodeSchema = nestedSchema(encoder.runtime, temporalCase.schema);
          const nestedDecodeSchema = nestedSchema(decoder.runtime, temporalCase.schema);
          const nestedEncoded = encoder.encode(nestedValue, nestedEncodeSchema);
          const nestedWire = JSON.parse(nestedEncoded);

          temporalCase.assertJsonWireShape(nestedWire.container.value, dateEncoding);
          temporalCase.assertJsonWireShape(nestedWire.list[0], dateEncoding);
          expectEqual(
            decoder.decodeText(nestedEncoded, nestedDecodeSchema),
            nestedValue,
          );
        });

        it(`CBOR ${temporalCase.name} top-level and nested roundtrip with ${encodingLabel} shape`, () => {
          const numericDateDecoding = matchingNumericDateDecoding(dateEncoding);
          const encoder = CBOREncoder.fromPolicy({ dateEncoding });
          const decoder = CBORDecoder.fromPolicy({ numericDateDecoding });

          const topEncoded = encoder.encode(temporalCase.value, temporalCase.schema);
          const topWire = CBOR.decode(topEncoded);
          temporalCase.assertCborWireShape(topWire, dateEncoding);
          expectEqual(
            decoder.decodeBuffer(topEncoded, temporalCase.schema),
            temporalCase.value,
          );

          const nestedValue: Nested<unknown> = {
            container: { value: temporalCase.value },
            list: [temporalCase.value],
          };
          const nestedEncodeSchema = nestedSchema(encoder.runtime, temporalCase.schema);
          const nestedDecodeSchema = nestedSchema(decoder.runtime, temporalCase.schema);
          const nestedEncoded = encoder.encode(nestedValue, nestedEncodeSchema);
          const nestedWire = CBOR.decode(nestedEncoded) as {
            container: { value: unknown };
            list: unknown[];
          };

          temporalCase.assertCborWireShape(nestedWire.container.value, dateEncoding);
          temporalCase.assertCborWireShape(nestedWire.list[0], dateEncoding);
          expectEqual(
            decoder.decodeBuffer(nestedEncoded, nestedDecodeSchema),
            nestedValue,
          );
        });
      }
    }
  });

  describe('OffsetDateTime wire policy assertions', () => {
    const value = OffsetDateTime.of(2001, 2, 3, 4, 5, 6, 7000000, ZoneOffset.UTC);

    it('JSON uses decimal-seconds numeric payload for DECIMAL_SECONDS_SINCE_EPOCH', () => {
      const encoded = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const wire = JSON.parse(encoded) as number;

      expect(wire).toBe(981173106.007);
    });

    it('JSON uses millisecond numeric payload for MILLISECONDS_SINCE_EPOCH', () => {
      const encoded = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const wire = JSON.parse(encoded) as number;

      expect(wire).toBe(981173106007);
    });

    it('CBOR uses decimal-seconds numeric payload for DECIMAL_SECONDS_SINCE_EPOCH', () => {
      const encoded = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const wire = CBOR.decode(encoded) as TaggedValue;

      expect(wire).toBeInstanceOf(TaggedValue);
      expect(wire.tag).toBe(epochDateTimeTag);
      expect(wire.value).toBe(981173106.007);
    });

    it('CBOR uses millisecond numeric payload for MILLISECONDS_SINCE_EPOCH', () => {
      const encoded = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const wire = CBOR.decode(encoded) as number;

      expect(wire).toBe(981173106007);
    });
  });

  describe('Policy mismatch guards', () => {
    const value = OffsetDateTime.of(1970, 1, 1, 0, 0, 12, 345000000, ZoneOffset.UTC);

    it('JSON OffsetDateTime does not roundtrip under mismatched numeric decoding policy', () => {
      const encoded = JSONEncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const decoded = JSONDecoder.fromPolicy({ numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH })
        .decodeText(encoded, OffsetDateTimeSchema);

      expect(decoded.toInstant().toEpochMilli()).not.toBe(value.toInstant().toEpochMilli());
    });

    it('CBOR OffsetDateTime does not roundtrip under mismatched numeric decoding policy', () => {
      const encoded = CBOREncoder.fromPolicy({ dateEncoding: DateEncoding.MILLISECONDS_SINCE_EPOCH })
        .encode(value, OffsetDateTimeSchema);
      const decoded = CBORDecoder.fromPolicy({ numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH })
        .decodeBuffer(encoded, OffsetDateTimeSchema);

      expect(decoded.toInstant().toEpochMilli()).not.toBe(value.toInstant().toEpochMilli());
    });

    it('CBOR tagged epoch-date-time decode takes precedence over numeric decoding policy', () => {
      const encoded = CBOR.encode(new TaggedValue(12.345, epochDateTimeTag));
      const decoded = CBORDecoder.fromPolicy({ numericDateDecoding: NumericDateDecoding.MILLISECONDS_SINCE_EPOCH })
        .decodeBuffer(encoded, OffsetDateTimeSchema);

      expect(decoded.toInstant().toEpochMilli()).toBe(12345);
    });
  });

  describe('Legacy shape rejection', () => {
    it('JSON rejects legacy scalar LocalDateTime timestamps', () => {
      expect(() =>
        JSONDecoder.default.decodeText('981173106.007', LocalDateTimeSchema),
      ).toThrow();
    });

    it('JSON rejects legacy scalar OffsetTime timestamps', () => {
      expect(() =>
        JSONDecoder.default.decodeText('3723.004', OffsetTimeSchema),
      ).toThrow();
    });

    it('CBOR rejects legacy tuple ZonedDateTime timestamps', () => {
      expect(() =>
        CBORDecoder.default.decodeBuffer(
          CBOR.encode([981173106.007, 'Z', 'Z']),
          ZonedDateTimeSchema,
        ),
      ).toThrow();
    });

    it('CBOR rejects legacy scalar LocalDate timestamps', () => {
      expect(() =>
        CBORDecoder.default.decodeBuffer(
          CBOR.encode(981158400),
          LocalDateSchema,
        ),
      ).toThrow();
    });
  });
});
