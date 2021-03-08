import { Instant } from '@js-joda/core';
import { URLQueryParamsEncoder } from './media-type-encoder';
import { JsonStringifier } from '@outfoxx/jackson-js';

export class URLEncoder implements URLQueryParamsEncoder {
  static get default(): URLEncoder {
    return new URLEncoder(
      URLEncoder.ArrayEncoding.BRACKETED,
      URLEncoder.BoolEncoding.NUMERIC,
      URLEncoder.DateEncoding.ISO8601
    );
  }

  constructor(
    private arrayEncoding: URLEncoder.ArrayEncoding,
    private boolEncoding: URLEncoder.BoolEncoding,
    private dateEncoding: URLEncoder.DateEncoding,
    private json = new JsonStringifier(),
    private encoder = new TextEncoder()
  ) {}

  encode<T = unknown>(value: T): ArrayBuffer | SharedArrayBuffer {
    const parameters = this.json.transform(value);

    return this.encoder.encode(this.encodeQueryString(parameters));
  }

  encodeQueryString(parameters: Record<string, unknown>): string {
    const components: [string, string][] = [];

    for (const key of Object.keys(parameters).sort()) {
      components.push(...this.encodeQueryComponent(key, parameters[key]));
    }
    return components.map((e) => `${e[0]}=${e[1]}`).join('&');
  }

  encodeQueryComponent(key: string, value: unknown): [string, string][] {
    const components: [string, string][] = [];

    if (value === undefined) {
      return components;
    }

    if (value instanceof Array) {
      // encode key according to `arrayEncoding`
      for (const item of value) {
        components.push(
          ...this.encodeQueryComponent(
            encodeArrayKey(key, this.arrayEncoding),
            item
          )
        );
      }
    } else if (value instanceof Instant) {
      //
      components.push([
        encodeURIComponent(key),
        encodeURIComponent(encodeDate(value, this.dateEncoding)),
      ]);
    } else if (typeof value === 'boolean') {
      //
      components.push([
        encodeURIComponent(key),
        encodeURIComponent(encodeBoolean(value, this.boolEncoding)),
      ]);
    } else if (typeof value === 'object') {
      //
      const rec = (value ?? {}) as Record<string, unknown>;

      for (const nestedKey of Object.keys(rec)) {
        components.push(
          ...this.encodeQueryComponent(`${key}[${nestedKey}]`, rec[nestedKey])
        );
      }
    } else {
      //
      components.push([
        encodeURIComponent(key),
        encodeURIComponent(`${value}`),
      ]);
    }

    return components;
  }
}

function encodeArrayKey(
  key: string,
  encoding: URLEncoder.ArrayEncoding
): string {
  return encoding === URLEncoder.ArrayEncoding.BRACKETED ? `${key}[]` : key;
}

function encodeBoolean(
  value: boolean,
  encoding: URLEncoder.BoolEncoding
): string {
  switch (encoding) {
    case URLEncoder.BoolEncoding.NUMERIC:
      return value ? '1' : '0';
    case URLEncoder.BoolEncoding.LITERAL:
      return value ? 'true' : 'false';
    default:
      throw new Error('unknown boolean encoding');
  }
}

function encodeDate(
  value: Date | Instant,
  encoding: URLEncoder.DateEncoding
): string {
  value = value instanceof Date ? Instant.ofEpochMilli(value.getTime()) : value;
  switch (encoding) {
    case URLEncoder.DateEncoding.SECONDS_SINCE_EPOCH:
      return `${value.toEpochMilli() / 1000.0}`;
    case URLEncoder.DateEncoding.MILLISECONDS_SINCE_EPOCH:
      return `${value.toEpochMilli()}`;
    case URLEncoder.DateEncoding.ISO8601:
      return value.toString();
    default:
      throw new Error('unknown date encoding');
  }
}

export namespace URLEncoder {
  /**
   * Configures how `Array` parameters are encoded.
   */
  export enum ArrayEncoding {
    /**
     * An empty set of square brackets is appended to the key for every value. This is the default behavior.
     */
    BRACKETED,
    /**
     * No brackets are appended. The key is encoded as is.
     */
    UNBRACKETED,
  }

  /**
   * Configures how `Bool` parameters are encoded.
   */
  export enum BoolEncoding {
    /**
     * Encode `true` as `1` and `false` as `0`. This is the default behavior.
     */
    NUMERIC,
    /**
     * Encode `true` and `false` as string literals.
     */
    LITERAL,
  }

  /**
   * Configures how `Date` parameters are encoded.
   */
  export enum DateEncoding {
    /**
     * Encode the `Date` as a UNIX timestamp (floating point seconds since epoch).
     */
    SECONDS_SINCE_EPOCH,

    /**
     * Encode the `Date` as UNIX millisecond timestamp (integer milliseconds since epoch).
     */
    MILLISECONDS_SINCE_EPOCH,

    /**
     * Encode the `Date` as an ISO-8601-formatted string (in RFC 3339 format). This is the default behavior.
     */
    ISO8601,
  }
}
