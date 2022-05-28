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

import { Instant, OffsetDateTime } from '@js-joda/core';
import { WWWFormUrlEncoder } from '../src';

describe('WWWFormUrlEncoder', () => {
  it('percent encodes keys', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ 'test/data': [1, 2, 3] })).toBe(
      'test%2Fdata=1&test%2Fdata=2&test%2Fdata=3',
    );
  });

  it('percent encodes values', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(
      encoder.encodeQueryString({ test: ['1/1', '1/2', '1/3', ` !'()~`] }),
    ).toBe(`test=1%2F1&test=1%2F2&test=1%2F3&test=%20!'()~`);
  });

  it('encodes complex objects', () => {
    const encoder = WWWFormUrlEncoder.default;

    expect(encoder.encodeQueryString({ test: { a: 1, b: 2 }, c: '3' })).toBe(
      'c=3&test%5Ba%5D=1&test%5Bb%5D=2',
    );
  });

  it('filters undefined values from complex objects', () => {
    const encoder = WWWFormUrlEncoder.default;

    expect(
      encoder.encodeQueryString({
        test: { a: 1, b: 2, nope: undefined },
        c: '3',
        other: undefined,
      }),
    ).toBe('c=3&test%5Ba%5D=1&test%5Bb%5D=2');
  });

  it('encodes array values in bracketed form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.BRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ test: [1, 2, 3] })).toBe(
      'test%5B%5D=1&test%5B%5D=2&test%5B%5D=3',
    );
  });

  it('encodes array values in unbracketed form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ test: [1, 2, 3] })).toBe(
      'test=1&test=2&test=3',
    );
  });

  it('encodes bool values in numeric form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ test: [true, false] })).toBe(
      'test=1&test=0',
    );
  });

  it('encodes bool values in literal form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ test: [true, false] })).toBe(
      'test=true&test=false',
    );
  });

  const date1 = Instant.parse('2017-05-15T08:30:00.123456789Z');
  const date2 = OffsetDateTime.parse(
    '2018-06-16T09:40:10.123456789+07:00',
  ).toInstant();

  it('encodes date values in ISO form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.ISO8601,
    );

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=2017-05-15T08%3A30%3A00.123456789Z&test=2018-06-16T02%3A40%3A10.123456789Z`,
    );
  });

  it('encodes date values in seconds-since-epoch form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.DECIMAL_SECONDS_SINCE_EPOCH,
    );

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=1494837000.1234567&test=1529116810.1234567`,
    );
  });

  it('encodes date values in milliseconds-since-epoch form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH,
    );

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=1494837000123&test=1529116810123`,
    );
  });

  it('encodes null values as flags', () => {
    const encoder = WWWFormUrlEncoder.default;

    expect(encoder.encodeQueryString({ flagged: null })).toBe(`flagged`);
  });
});
