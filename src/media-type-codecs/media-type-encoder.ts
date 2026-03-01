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

import { SchemaLike } from '../schema-runtime.js';

export interface MediaTypeEncoder {
  encode<T>(value: T, type?: SchemaLike<T>): BodyInit;
}

export interface URLQueryParamsEncoder extends MediaTypeEncoder {
  encodeQueryString(value: Record<string, unknown>): string;
}

export function isURLQueryParamsEncoder(
  encoder: MediaTypeEncoder | URLQueryParamsEncoder | undefined,
): encoder is URLQueryParamsEncoder {
  const rec = encoder as unknown as Record<string, unknown>;
  return typeof rec.encodeQueryString === 'function';
}

export interface StructuredMediaTypeEncoder extends MediaTypeEncoder {
  encodeObject<T>(
    value: T,
    type?: SchemaLike<T>,
    includeNulls?: boolean,
  ): Record<string, unknown>;
}

export function isStructuredMediaTypeEncoder(
  encoder: MediaTypeEncoder | StructuredMediaTypeEncoder | undefined,
): encoder is StructuredMediaTypeEncoder {
  const rec = encoder as unknown as Record<string, unknown>;
  return typeof rec.encodeObject === 'function';
}
