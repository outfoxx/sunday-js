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

import { expandExpression, parse } from 'uri-template';

/** An RFC 6570 URL template with reusable parameter defaults. */
export class URLTemplate {
  /** Creates a template whose stored parameters can be overridden for each expansion. */
  constructor(
    public template: string,
    public parameters: Record<string, unknown> = {},
  ) {}

  /** Expands base and relative templates, preserving empty values and omitting null or missing values. */
  complete(relativeTemplate: string, parameters: Record<string, unknown>): URL {
    const allParameters = { ...this.parameters, ...parameters };
    const baseTempl = this.template.endsWith('/')
      ? this.template.slice(0, -1)
      : this.template;
    const relTempl =
      relativeTemplate.startsWith('/') || !relativeTemplate.length
        ? relativeTemplate
        : `/${relativeTemplate}`;
    const template = parse(baseTempl + relTempl);
    const expanded = template.ast.parts
      .map((part) => {
        if (part.type === 'literal') return part.value;
        const value = expandExpression(part, allParameters);
        // uri-template 2 drops the path prefix when defined variables expand to an empty string.
        if (
          part.operator === '/' &&
          value === '' &&
          part.variables.some((variable) =>
            isDefined(allParameters[variable.name]),
          )
        ) {
          return '/';
        }
        return value;
      })
      .join('');
    return new URL(expanded);
  }
}

// RFC 6570 treats empty collections as undefined, but an empty string is defined.
function isDefined(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.values(value).some((entry) => entry != null);
}
