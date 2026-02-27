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

import {
  deserializeOptional,
  deserializeRequired,
  expectObject,
  Serde,
  serializeOptional,
  serializeRequired,
} from '../src';

type FieldSpec<T> = {
  key?: string;
  serde: Serde<T>;
  optional?: boolean;
  nullable?: boolean;
};

export function objectSerde<T>(
  label: string,
  fields: Record<string, FieldSpec<unknown>>,
): Serde<T> {
  return {
    serialize(value, ctx) {
      const source = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      Object.entries(fields).forEach(([name, field]) => {
        const key = field.key ?? name;
        const nullable = field.nullable ?? false;
        if (field.optional) {
          serializeOptional(
            result,
            key,
            source[name],
            field.serde,
            ctx,
            nullable,
          );
        } else {
          serializeRequired(
            result,
            key,
            source[name],
            field.serde,
            ctx,
            nullable,
          );
        }
      });
      return result;
    },
    deserialize(input, ctx) {
      const obj = expectObject(input, label);
      const result: Record<string, unknown> = {};
      Object.entries(fields).forEach(([name, field]) => {
        const key = field.key ?? name;
        const nullable = field.nullable ?? false;
        if (field.optional) {
          result[name] = deserializeOptional(
            obj,
            key,
            field.serde,
            ctx,
            nullable,
          );
        } else {
          result[name] = deserializeRequired(
            obj,
            key,
            field.serde,
            ctx,
            nullable,
          );
        }
      });
      return result as T;
    },
  };
}
