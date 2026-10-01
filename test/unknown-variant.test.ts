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
import { z } from 'zod';
import { isUnknownVariant, unionWithUnknown, UnknownVariant, UnknownVariantTag } from '../src';

describe('unknown discriminated variants', () => {
  it('does not encode a marked fallback through a structurally compatible known branch', () => {
    let knownChecks = 0;
    const known = z.object({ kind: z.literal('created'), count: z.number().min(1) }).refine(() => {
      knownChecks += 1;
      return true;
    });
    const fallback = z.custom<UnknownVariant>(isUnknownVariant).refine(() => false, { message: 'unknown_union' });
    const schema = unionWithUnknown(known, fallback);
    const disguised = { [UnknownVariantTag]: true as const, kind: 'created' as const, count: 1, rawBody: { kind: 'created', count: 1 } };
    const result = schema.safeEncode(disguised);
    expect(result.success).toBe(false);
    expect(knownChecks).toBe(0);
    schema.encode({ kind: 'created', count: 1 });
    expect(knownChecks).toBe(1);
    expect(schema.safeEncode({ kind: 'created', count: 0 }).success).toBe(false);
  });

  it('preserves native error paths from a failed known branch', () => {
    const known = z.object({ kind: z.literal('created'), count: z.number().min(1) });
    const fallback = z.custom<UnknownVariant>(isUnknownVariant);
    const schema = z.object({ event: unionWithUnknown(known, fallback) });
    const result = schema.safeEncode({ event: { kind: 'created', count: 0 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['event', 'count']);
  });
});
