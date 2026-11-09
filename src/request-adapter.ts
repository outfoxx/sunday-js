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

/**
 * Adapts once per Sunday-managed Fetch call or request export. Native redirects/recovery can
 * retransmit without another invocation. Consumed resources must be replaced before returning.
 */
export interface RequestAdapter {
  /** Returns the adapted value; throwing stops the remaining adapters. */
  adapt(request: Request): Request | Promise<Request>;
}
