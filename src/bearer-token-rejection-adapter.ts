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

import type { ResponseAdapter } from './response-adapter.js';
import { RequestCancellationError } from './request-cancellation-error.js';
import { isBearerTokenRejection } from './request-security.js';

/** Opt-in stop policy for explicit bearer rejection. Does not acquire, invalidate, refresh, or replay. */
export class BearerTokenRejectionAdapter implements ResponseAdapter {
  /** Leaves unrelated responses and all bodies untouched. Compose after provider feedback when used. */
  async adapt(response: Response, request: Request): Promise<Response> {
    if (isBearerTokenRejection(request, response))
      throw new RequestCancellationError('Access token rejected');
    return response;
  }
}
