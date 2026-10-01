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

import { z } from 'zod';

/** Marks a fallback independently of its discriminator or structural fields. */
export const UnknownVariantTag: unique symbol = Symbol.for('@outfoxx/sunday/UnknownVariant');

/** An unknown discriminated payload whose original wire fields are preserved. */
export interface UnknownVariant {
  readonly [UnknownVariantTag]: true;
  readonly rawBody: Readonly<Record<string, unknown>>;
}

/** Identifies fallback instances even when their discriminator resembles a known branch. */
export function isUnknownVariant(value: unknown): value is UnknownVariant {
  return typeof value === 'object' && value !== null
    && UnknownVariantTag in value && value[UnknownVariantTag] === true;
}

/** Dispatches encoding by fallback identity while retaining native schema validation. */
export function unionWithUnknown<K extends z.ZodType, U extends z.ZodType<UnknownVariant>>(
  known: K,
  unknown: U,
): z.ZodType<z.output<K> | z.output<U>> {
  const wire = z.union([known, unknown]);
  return z.codec(z.unknown(), z.custom<z.output<K> | z.output<U>>(), {
    decode(value, context) {
      const result = wire.safeParse(value);
      if (!result.success) {
        context.issues.push(...result.error.issues.map(issue => ({ ...issue, input: undefined })));
        return z.NEVER;
      }
      return result.data;
    },
    encode(value, context) {
      const schema: z.ZodType = isUnknownVariant(value) ? unknown : known;
      const result = schema.safeEncode(value);
      if (!result.success) {
        context.issues.push(...result.error.issues.map(issue => ({ ...issue, input: undefined })));
        return z.NEVER;
      }
      return result.data;
    },
  });
}
