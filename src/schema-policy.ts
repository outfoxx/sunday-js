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

export type SchemaFormat = 'json' | 'cbor';

/**
 * Write-side flag bundle that mirrors Jackson date/time serialization modes.
 * - `ISO8601`: `WRITE_DATES_AS_TIMESTAMPS` disabled.
 * - `DECIMAL_SECONDS_SINCE_EPOCH`: timestamps enabled with nanos precision.
 * - `MILLISECONDS_SINCE_EPOCH`: timestamps enabled with millis precision.
 */
export enum DateEncoding {
  DECIMAL_SECONDS_SINCE_EPOCH,
  MILLISECONDS_SINCE_EPOCH,
  ISO8601,
}

/**
 * Read-side interpretation for untagged numeric date/time payloads.
 * This mirrors Jackson numeric timestamp decoding expectations.
 */
export enum NumericDateDecoding {
  DECIMAL_SECONDS_SINCE_EPOCH,
  MILLISECONDS_SINCE_EPOCH,
}

export enum ArrayBufferEncoding {
  BASE64,
  BASE64URL,
  RAW_BYTES,
}

export interface SchemaPolicy {
  format: SchemaFormat;
  dateEncoding: DateEncoding;
  numericDateDecoding: NumericDateDecoding;
  arrayBufferEncoding: ArrayBufferEncoding;
}
