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

import { isRequestStopped } from '../request-cancellation-error.js';
import { nativeBodyOperation } from './owned-body.js';

/** @internal Repairs native Fetch failures only; source ownership takes precedence over native causes. */
export function nativeFetch(
  request: Request,
  signal: AbortSignal,
): Promise<Response> {
  return nativeBodyOperation(request.body, async () => {
    try {
      return await fetch(request, { signal });
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      // Node may carry an unmanaged upload's stop error in Fetch's cause chain. This walk must
      // never surround adapters, credential providers, decoders, or custom Fetch callbacks.
      const seen = new Set<unknown>();
      let cause = error;
      while (typeof cause === 'object' && cause !== null && !seen.has(cause)) {
        if (isRequestStopped(cause)) throw cause;
        seen.add(cause);
        cause = 'cause' in cause ? cause.cause : undefined;
      }
      throw error;
    }
  });
}
