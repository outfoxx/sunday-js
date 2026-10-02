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

/** Decodes standard or URL-safe base64 with optional padding and loose final chunks. */
export function decodeBase64(value: string, alphabet: 'base64' | 'base64url' = 'base64'): ArrayBuffer {
  if (alphabet === 'base64url') {
    if (/[+/]/.test(value)) {
      throw new SyntaxError('Invalid base64url input');
    }
    value = value.replaceAll('-', '+').replaceAll('_', '/');
  }

  let binary: string;
  try {
    binary = atob(value);
  } catch (error) {
    throw new SyntaxError('Invalid base64 input', { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** Encodes a byte view as unpadded standard or URL-safe base64. */
export function encodeBase64(value: Uint8Array, alphabet: 'base64' | 'base64url' = 'base64'): string {
  const chunks: string[] = [];
  // Bound spread arguments independently of payload size on all supported JavaScript engines.
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...value.subarray(offset, offset + chunkSize)));
  }
  const encoded = btoa(chunks.join('')).replace(/=+$/, '');
  return alphabet === 'base64url' ? encoded.replaceAll('+', '-').replaceAll('/', '_') : encoded;
}
