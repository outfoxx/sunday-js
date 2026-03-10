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

import { TaggedValue } from 'cbor-redux';
import { z } from 'zod';
import { ParsePayload } from 'zod/v4/core';
import { base64Tag, base64UrlTag, uriTag } from './media-type-codecs/cbor-tags.js';
import {
  ArrayBufferEncoding,
  SchemaPolicy,
} from './schema-policy.js';
import { defineSchema } from './schema-runtime.js';

export type BuiltinSchemaSet = {
  readonly urlSchema: z.ZodType<URL>;
  readonly arrayBufferSchema: z.ZodType<ArrayBuffer>;
};

export const UNKNOWN_SCHEMA = z.unknown();
export const ANY_SCHEMA = UNKNOWN_SCHEMA;
export const NULL_SCHEMA = z.null();
export const STRING_SCHEMA = z.string();
export const NUMBER_SCHEMA = z.number();
export const BOOLEAN_SCHEMA = z.boolean();

export const UnknownSchema = UNKNOWN_SCHEMA;
export const AnySchema = ANY_SCHEMA;
export const NullSchema = NULL_SCHEMA;
export const StringSchema = STRING_SCHEMA;
export const NumberSchema = NUMBER_SCHEMA;
export const BooleanSchema = BOOLEAN_SCHEMA;

const URL_OUTPUT_SCHEMA = z.instanceof(URL);
const ARRAY_BUFFER_OUTPUT_SCHEMA = z.instanceof(ArrayBuffer);
const ARRAY_BUFFER_RAW_INPUT_SCHEMA = z.union([
  ARRAY_BUFFER_OUTPUT_SCHEMA,
  z.instanceof(Uint8Array),
]);

const policySchemas = new Map<string, BuiltinSchemaSet>();

function decodeURL(value: string, ctx: ParsePayload): URL {
  try {
    return new URL(value);
  }
  catch {
    ctx.issues.push(
      {
        code: 'invalid_format',
        format: 'url',
        input: value,
        message: `Invalid URL value`,
      },
    );
    return z.NEVER;
  }
}

const URL_JSON_CODEC = z.codec(z.string(), URL_OUTPUT_SCHEMA, {
  decode: decodeURL,
  encode: (value) => value.toString(),
});

const URL_CBOR_CODEC = z.codec(z.union([z.string(), z.instanceof(TaggedValue)]), URL_OUTPUT_SCHEMA, {
  decode: (value, ctx) => {
    // Tagged URL input is accepted for compatibility and decoded before untagged string input.
    if (value instanceof TaggedValue) {
      if (value.tag == uriTag) {
        const string = z.string().parse(value.value);
        return decodeURL(string, ctx);
      }
      else {
        ctx.issues.push(
          {
            code: 'invalid_value',
            values: [uriTag],
            input: value.tag,
            message: `Invalid tag for URL`,
          },
        );
        return z.NEVER;
      }
    }
    else {
      return decodeURL(value, ctx);
    }
  },
  encode: (value) => {
    // CBOR tag 32 carries the same URI string Jackson expects when tags are ignored.
    return new TaggedValue(value.toString(), uriTag);
  },
});

function base64Decoder(encoding: ArrayBufferEncoding): (value: string) => ArrayBuffer {
  let options: { alphabet: 'base64' | 'base64url', lastChunkHandling: 'loose' };
  switch (encoding) {
    case ArrayBufferEncoding.BASE64:
      options = { alphabet: 'base64', lastChunkHandling: 'loose' };
      break;
    case ArrayBufferEncoding.BASE64URL:
      options = { alphabet: 'base64url', lastChunkHandling: 'loose' };
      break;
    default:
      throw new TypeError(`Invalid ArrayBufferEncoding: ${encoding}`);
  }
  return (value) => {
    const array = Uint8Array.fromBase64(value, options);
    return array
      .buffer
      .slice();
  };
}

function base64Encoder(encoding: ArrayBufferEncoding): (buffer: ArrayBufferLike) => string {
  let options: { alphabet: 'base64' | 'base64url', omitPadding: true };
  switch (encoding) {
    case ArrayBufferEncoding.BASE64:
      options = { alphabet: 'base64', omitPadding: true };
      break;
    case ArrayBufferEncoding.BASE64URL:
      options = { alphabet: 'base64url', omitPadding: true };
      break;
    default:
      throw new TypeError(`Invalid ArrayBufferEncoding: ${encoding}`);
  }
  return (value) => {
    return new Uint8Array(value).toBase64(options);
  };
}

function createArrayBufferSchema(policy: SchemaPolicy): z.ZodType<ArrayBuffer> {
  switch (policy.format) {
    case 'json':
      return z.codec(z.string(), ARRAY_BUFFER_OUTPUT_SCHEMA, {
        decode: base64Decoder(policy.arrayBufferEncoding),
        encode: base64Encoder(policy.arrayBufferEncoding),
      });
    case 'cbor':
      if (policy.arrayBufferEncoding == ArrayBufferEncoding.RAW_BYTES) {
        return z.codec(ARRAY_BUFFER_RAW_INPUT_SCHEMA, ARRAY_BUFFER_OUTPUT_SCHEMA, {
          decode: (v) => (
            ArrayBuffer.isView(v)
              ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
              : v
          ),
          encode: (v) => v,
        });
      } else {
        const b64Decode = base64Decoder(policy.arrayBufferEncoding);
        const b64Encode = base64Encoder(policy.arrayBufferEncoding);
        const textTag = policy.arrayBufferEncoding === ArrayBufferEncoding.BASE64 ? base64Tag : base64UrlTag;
        return z.codec(z.union([z.string(), z.instanceof(TaggedValue)]), ARRAY_BUFFER_OUTPUT_SCHEMA, {
          decode: (value, ctx) => {
            // Tagged textual binary values are accepted for compatibility and decoded before policy-based untagged text.
            if (value instanceof TaggedValue) {
              const string = z.string().decode(value.value);
              switch (value.tag) {
                case base64Tag:
                  return Uint8Array
                    .fromBase64(string, { alphabet: 'base64', lastChunkHandling: 'loose' })
                    .buffer;
                case base64UrlTag:
                  return Uint8Array
                    .fromBase64(string, { alphabet: 'base64url', lastChunkHandling: 'loose' })
                    .buffer;
                default:
                  ctx.issues.push(
                    {
                      code: 'invalid_value',
                      values: [base64UrlTag, base64Tag],
                      input: value.tag
                    }
                  )
                  return z.NEVER
              }
            }

            return b64Decode(value);
          },
          encode: (value) => {
            // CBOR tags 33/34 preserve Jackson-compatible textual payloads for base64 modes.
            return new TaggedValue(b64Encode(value), textTag);
          },
        });
      }
  }
}

function createPolicySchemas(policy: SchemaPolicy): BuiltinSchemaSet {
  return {
    urlSchema: policy.format === 'cbor' ? URL_CBOR_CODEC : URL_JSON_CODEC,
    arrayBufferSchema: createArrayBufferSchema(policy),
  };
}

function policyKey(policy: SchemaPolicy): string {
  return [
    policy.format,
    policy.arrayBufferEncoding.toString(),
  ].join(':');
}

export function builtinSchemasForPolicy(policy: SchemaPolicy): BuiltinSchemaSet {
  const key = policyKey(policy);
  const cached = policySchemas.get(key);
  if (cached) {
    return cached;
  }

  const schemas = createPolicySchemas(policy);
  policySchemas.set(key, schemas);
  return schemas;
}

export const URLSchema = defineSchema(
  (runtime) => builtinSchemasForPolicy(runtime.policy).urlSchema,
  {
    id: Symbol.for('@outfoxx/sunday/URLSchema'),
    debugName: 'URLSchema',
  },
);

export const ArrayBufferSchema = defineSchema(
  (runtime) => builtinSchemasForPolicy(runtime.policy).arrayBufferSchema,
  {
    id: Symbol.for('@outfoxx/sunday/ArrayBufferSchema'),
    debugName: 'ArrayBufferSchema',
  },
);
