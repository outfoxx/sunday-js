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

import type { SecurityBinding } from './security-binding.js';

const bindings = new WeakMap<Request, readonly SecurityBinding[]>();
const empty: readonly SecurityBinding[] = Object.freeze([]);

/** Returns operation security metadata for application-owned HTTP adapters, without token state. */
export function requestSecurityBindings(
  request: Request,
): readonly SecurityBinding[] {
  return bindings.get(request) ?? empty;
}

/** @internal Snapshots metadata without adding wire headers or credential receipts. */
export function setRequestSecurityBindings(
  request: Request,
  values: readonly SecurityBinding[],
): Request {
  bindings.set(
    request,
    Object.freeze(
      values.map((value) =>
        Object.freeze({
          ...value,
          scopes: Object.freeze([...value.scopes]),
          transport: Object.freeze({ ...value.transport }),
        }),
      ),
    ),
  );
  return request;
}
