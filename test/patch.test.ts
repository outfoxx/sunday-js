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
import { arrayBufferSerde, JSONDecoder, JSONEncoder, stringSerde } from '../src';
import { expectEqual } from './expect-utils';
import { objectSerde } from './serde-test-helpers';

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

const BPatchSerde = objectSerde<BPatch>('BPatch', {
  type: { serde: stringSerde, optional: true, nullable: true },
  enc: { serde: arrayBufferSerde, optional: true, nullable: true },
  sig: { serde: arrayBufferSerde, optional: true, nullable: true },
});

const APatchSerde = objectSerde<APatch>('APatch', {
  name: { serde: stringSerde, optional: true, nullable: true },
  b: { serde: BPatchSerde, optional: true, nullable: true },
  c: { serde: stringSerde, optional: true, nullable: true },
});

describe('JSON Merge Patching', () => {
  describe('validate Serde functionality', () => {
    it('handles nested patch objects', () => {
      const patch: APatch = {
        name: 'kevin',
        b: {
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        },
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSerde, true);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSerde,
      );

      expect(patchDecoded.c).toBeUndefined();
      expect(patchDecoded.b?.sig).toBeNull();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSerde, true)).toEqual(
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

      const patchJSON = JSONEncoder.default.encode(patch, APatchSerde, true);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSerde,
      );

      expect(patchDecoded.c).toBeUndefined();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSerde, true)).toEqual(
        patchJSON,
      );
    });

    it('excludes undefined objects', () => {
      const patch: APatch = {
        name: 'kevin',
        c: 'test',
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSerde, true);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSerde,
      );

      expect(patchDecoded.b).toBeUndefined();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSerde, true)).toEqual(
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

      const patchJSON = JSONEncoder.default.encode(patch, APatchSerde, true);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSerde,
      );

      expect(patchDecoded.c).toBeNull();
      expectEqual(patchDecoded, patch);
      expect(JSONEncoder.default.encode(patchDecoded, APatchSerde, true)).toEqual(
        patchJSON,
      );
    });

    it('includes null objects', () => {
      const patch: APatch = {
        name: 'kevin',
        b: null,
        c: 'test',
      };

      const patchJSON = JSONEncoder.default.encode(patch, APatchSerde, true);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(
        patchJSON,
        APatchSerde,
      );

      expect(patchDecoded.b).toBeNull();
      expect(JSONEncoder.default.encode(patchDecoded, APatchSerde, true)).toEqual(
        patchJSON,
      );
    });
  });
});
