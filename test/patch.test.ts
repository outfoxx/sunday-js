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

import { JSONDecoder, JSONEncoder } from '../src';
import {
  JsonClassType,
  JsonInclude,
  JsonIncludeType,
  JsonProperty,
} from '@outfoxx/jackson-js';

@JsonInclude({ value: JsonIncludeType.ALWAYS })
class BPatch {
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [String] })
  public type?: string;
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [ArrayBuffer] })
  public enc?: ArrayBuffer | null;
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [ArrayBuffer] })
  public sig?: ArrayBuffer | null;

  constructor(init: Partial<BPatch>) {
    Object.assign(this, init);
  }
}

@JsonInclude({ value: JsonIncludeType.ALWAYS })
class APatch {
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [String] })
  public name?: string | null;
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [BPatch] })
  public b?: BPatch | null;
  @JsonProperty({ required: false })
  @JsonClassType({ type: () => [String] })
  public c?: string | null;

  constructor(init: Partial<APatch>) {
    Object.assign(this, init);
  }
}

describe('JSON Merge Patching', () => {
  describe('validate JacksonJS functionality', () => {
    it('handles nested patch classes', () => {
      const patch = new APatch({
        name: 'kevin',
        b: new BPatch({
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        }),
      });

      const patchJSON = JSONEncoder.default.encode(patch, [APatch]);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(patchJSON, [
        APatch,
      ]);

      expect(patchDecoded.c).toBeUndefined();
      expect(patchDecoded.b?.sig).toBeNull();
      expect(patchDecoded).toEqual(patch);
      expect(JSONEncoder.default.encode(patchDecoded)).toEqual(patchJSON);
    });

    it('excludes undefined primitives', () => {
      const patch = new APatch({
        name: 'kevin',
        b: new BPatch({
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        }),
      });

      const patchJSON = JSONEncoder.default.encode(patch, [APatch]);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(patchJSON, [
        APatch,
      ]);

      expect(patchDecoded.c).toBeUndefined();
      expect(patchDecoded).toEqual(patch);
      expect(JSONEncoder.default.encode(patchDecoded)).toEqual(patchJSON);
    });

    it('excludes undefined classes', () => {
      const patch = new APatch({
        name: 'kevin',
        c: 'test',
      });

      const patchJSON = JSONEncoder.default.encode(patch, [APatch]);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(patchJSON, [
        APatch,
      ]);

      expect(patchDecoded.b).toBeUndefined();
      expect(patchDecoded).toEqual(patch);
      expect(JSONEncoder.default.encode(patchDecoded)).toEqual(patchJSON);
    });

    it('includes null primitives', () => {
      const patch = new APatch({
        name: 'kevin',
        b: new BPatch({
          type: '17',
          enc: new Uint8Array([1, 2, 3]).buffer,
          sig: null,
        }),
        c: null,
      });

      const patchJSON = JSONEncoder.default.encode(patch, [APatch]);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(patchJSON, [
        APatch,
      ]);

      expect(patchDecoded.c).toBeNull();
      expect(patchDecoded).toEqual(patch);
      expect(JSONEncoder.default.encode(patchDecoded)).toEqual(patchJSON);
    });

    it('includes null classes', () => {
      const patch = new APatch({
        name: 'kevin',
        b: null,
        c: 'test',
      });

      const patchJSON = JSONEncoder.default.encode(patch, [APatch]);
      const patchDecoded = JSONDecoder.default.decodeText<APatch>(patchJSON, [
        APatch,
      ]);

      expect(patchDecoded.b).toBeNull();
      expect(JSONEncoder.default.encode(patchDecoded)).toEqual(patchJSON);
    });
  });
});
