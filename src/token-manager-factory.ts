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

import { TokenManager } from './token-manager.js';
import { TokenProvider } from './token-provider.js';

/**
 * Creates a manager from resolved providers without token acquisition or storage I/O.
 * Supply the native manager's store, expirySkewMs and now options here.
 * Called once for secured settings and never when there are no selected providers.
 * The application owns the returned manager and its store/session lifecycle.
 */
export type TokenManagerFactory = (providers: Readonly<Record<string, TokenProvider>>) => TokenManager;
