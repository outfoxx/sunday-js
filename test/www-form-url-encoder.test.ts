import { Instant, OffsetDateTime } from '@js-joda/core';
import { WWWFormUrlEncoder } from '../src';

describe('WWWFormUrlEncoder', () => {
  it('percent encodes keys', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(encoder.encodeQueryString({ 'test/data': [1, 2, 3] })).toBe(
      'test%2Fdata=1&test%2Fdata=2&test%2Fdata=3'
    );
  });

  it('percent encodes values', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(
      encoder.encodeQueryString({ test: ['1/1', '1/2', '1/3', ` !'()~`] })
    ).toBe(`test=1%2F1&test=1%2F2&test=1%2F3&test=%20!'()~`);
  });

  it('encodes complex objects', () => {
    const encoder = WWWFormUrlEncoder.default;

    expect(encoder.encodeQueryString({ test: { a: 1, b: 2 }, c: '3' })).toBe(
      'c=3&test%5Ba%5D=1&test%5Bb%5D=2'
    );
  });

  it('filters undefined values from complex objects', () => {
    const encoder = WWWFormUrlEncoder.default;

    expect(
      encoder.encodeQueryString({
        test: { a: 1, b: 2, nope: undefined },
        c: '3',
        other: undefined,
      })
    ).toBe('c=3&test%5Ba%5D=1&test%5Bb%5D=2');
  });

  it('encodes array values in bracketed form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.BRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(encoder.encodeQueryString({ test: [1, 2, 3] })).toBe(
      'test%5B%5D=1&test%5B%5D=2&test%5B%5D=3'
    );
  });

  it('encodes array values in unbracketed form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(encoder.encodeQueryString({ test: [1, 2, 3] })).toBe(
      'test=1&test=2&test=3'
    );
  });

  it('encodes bool values in numeric form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.NUMERIC,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(encoder.encodeQueryString({ test: [true, false] })).toBe(
      'test=1&test=0'
    );
  });

  it('encodes bool values in literal form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    expect(encoder.encodeQueryString({ test: [true, false] })).toBe(
      'test=true&test=false'
    );
  });

  const date1 = Instant.parse('2017-05-15T08:30:00Z');
  const date2 = OffsetDateTime.parse('2018-06-16T09:40:10+07:00').toInstant();

  it('encodes date values in ISO form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.ISO8601
    );

    const date1Val = encodeURIComponent(date1.toString());
    const date2Val = encodeURIComponent(date2.toString());

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=${date1Val}&test=${date2Val}`
    );
  });

  it('encodes date values in seconds-since-epoch form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.SECONDS_SINCE_EPOCH
    );

    const date1Val = encodeURIComponent(date1.toEpochMilli() / 1000.0);
    const date2Val = encodeURIComponent(date2.toEpochMilli() / 1000.0);

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=${date1Val}&test=${date2Val}`
    );
  });

  it('encodes date values in milliseconds-since-epoch form', () => {
    const encoder = new WWWFormUrlEncoder(
      WWWFormUrlEncoder.ArrayEncoding.UNBRACKETED,
      WWWFormUrlEncoder.BoolEncoding.LITERAL,
      WWWFormUrlEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH
    );

    const date1Val = encodeURIComponent(date1.toEpochMilli());
    const date2Val = encodeURIComponent(date2.toEpochMilli());

    expect(encoder.encodeQueryString({ test: [date1, date2] })).toBe(
      `test=${date1Val}&test=${date2Val}`
    );
  });
});
