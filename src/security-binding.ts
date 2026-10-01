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

/** Acquisition endpoints selected by generation; deployment overrides never select another profile. */
export interface SecurityEndpoints {
  readonly discoveryUrl?: string;
  readonly authorizationUrl?: string;
  readonly tokenUrl?: string;
  readonly refreshUrl?: string;
}

/** One logical scheme in the complete alternative selected for an operation. */
export interface SecurityBinding extends SecurityEndpoints {
  readonly scheme: string;
  readonly provider: string;
  readonly profile?: string;
  readonly flow: 'clientCredentials' | 'authorizationCode' | 'external' | 'static';
  readonly scopes: readonly string[];
  readonly audience?: string;
  readonly resource?: string;
  readonly transport: {
    readonly location: 'header' | 'query' | 'cookie';
    readonly name: string;
    readonly prefix?: string;
  };
}
