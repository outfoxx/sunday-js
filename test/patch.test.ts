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

import {describe, it, expect} from 'bun:test';
import { z } from 'zod';
import { ArrayBufferSchema, JSONDecoder, JSONEncoder } from '../src';
import { expectEqual } from './expect-utils';

type BPatch = {
  type?: string | null;
  enc?: ArrayBuffer | null;
  sig?: ArrayBuffer | null;
};

type APatch = {
  name?: string | null;
  b?: BPatch | null;
  c?: string | null;
};

const arrayBufferCodec = JSONEncoder.default.runtime.resolveSchema(ArrayBufferSchema);

const BPatchSchema = z.object({
  type: z.string().nullable().optional(),
  enc: arrayBufferCodec.nullable().optional(),
  sig: arrayBufferCodec.nullable().optional(),
});

const APatchSchema = z.object({
  name: z.string().nullable().optional(),
  b: BPatchSchema.nullable().optional(),
  c: z.string().nullable().optional(),
});

describe('JSON Merge Patching', () => {
  describe('validate schema functionality', () => {
    it('handles nested patch objects', () => {
      const patch: APatch = {
        name: 'kevin',
        b: {
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        },
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSchema);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSchema,
      );

      expect(patchDecoded.c).toBeUndefined();
      expect(patchDecoded.b?.sig).toBeNull();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSchema)).toEqual(
        patchJSON,
      );
    });

    it('excludes undefined primitives', () => {
      const patch: APatch = {
        name: 'kevin',
        b: {
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        },
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSchema);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSchema,
      );

      expect(patchDecoded.c).toBeUndefined();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSchema)).toEqual(
        patchJSON,
      );
    });

    it('excludes undefined objects', () => {
      const patch: APatch = {
        name: 'kevin',
        c: 'test',
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSchema);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSchema,
      );

      expect(patchDecoded.b).toBeUndefined();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSchema)).toEqual(
        patchJSON,
      );
    });

    it('includes null primitives', () => {
      const patch: APatch = {
        name: 'kevin',
        b: {
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        },
        c: null,
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSchema);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSchema,
      );

      expect(patchDecoded.c).toBeNull();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSchema)).toEqual(
        patchJSON,
      );
    });

    it('includes null objects', () => {
      const patch: APatch = {
        name: 'kevin',
        b: null,
        c: 'test',
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSchema);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSchema,
      );

      expect(patchDecoded.b).toBeNull();
      expect(JSONEncoder.default.encode(patchDecoded, APatchSchema)).toEqual(
        patchJSON,
      );
    });
  });
});
