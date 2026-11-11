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

const contexts = new WeakMap<Request, Map<symbol, unknown>>();

/** Application-owned metadata retained across Sunday request copies and adapter replacements. */
export function requestContext(request: Request): Map<symbol, unknown> {
  let context = contexts.get(request);
  if (!context) {
    context = new Map();
    contexts.set(request, context);
  }
  return context;
}

/** @internal Preserve metadata while allowing an adapter to replace its own entries. */
export function inheritRequestContext(
  source: Request,
  target: Request,
): Request {
  contexts.set(
    target,
    new Map([...requestContext(source), ...requestContext(target)]),
  );
  return target;
}
