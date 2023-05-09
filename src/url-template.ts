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

import { parse } from 'uri-template';

export class URLTemplate {
  constructor(
    public template: string,
    public parameters: Record<string, unknown> = {},
  ) {}

  complete(relativeTemplate: string, parameters: Record<string, unknown>): URL {
    const allParameters = Object.assign({}, this.parameters, parameters);
    const baseTempl = this.template.endsWith('/')
      ? this.template.slice(0, -1)
      : this.template;
    const relTempl =
      relativeTemplate.startsWith('/') || !relativeTemplate.length
        ? relativeTemplate
        : `/${relativeTemplate}`;
    return new URL(parse(baseTempl + relTempl).expand(allParameters));
  }
}
