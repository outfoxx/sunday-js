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

export class MediaType {
  type: MediaType.Type;
  tree: MediaType.Tree;
  subtype: string;
  suffix?: MediaType.Suffix;
  parameters: Record<string, string>;

  constructor(params: {
    type: MediaType.Type;
    tree?: MediaType.Tree;
    subtype: string;
    suffix?: MediaType.Suffix;
    parameters?: Record<string, string>;
  }) {
    this.type = params.type;
    this.tree = params.tree ?? MediaType.Tree.Standard;
    this.subtype = params.subtype.toLowerCase();
    this.suffix = params.suffix;
    this.parameters = Object.entries(params.parameters ?? {}).reduce(
      (obj, [name, value]) => {
        obj[name.toLowerCase()] = value.toLowerCase();
        return obj;
      },
      {} as Record<string, string>,
    );
  }

  parameter(name: MediaType.ParameterName | string): string | undefined {
    return this.parameters[name];
  }

  with(params: {
    type?: MediaType.Type;
    tree?: MediaType.Tree;
    subtype?: string;
    suffix?: MediaType.Suffix;
    parameters?: Record<string, string>;
  }): MediaType {
    return new MediaType({
      type: params.type ?? this.type,
      tree: params.tree ?? this.tree,
      subtype: params.subtype ?? this.subtype,
      suffix: params.suffix ?? this.suffix,
      parameters: params.parameters ?? this.parameters,
    });
  }

  withParameter(
    parameter: MediaType.ParameterName | string,
    value: string,
  ): MediaType {
    const parameters = Object.assign({}, this.parameters, {
      [parameter]: value,
    });
    return this.with({ parameters });
  }

  get value(): string {
    const type = this.type;
    const tree = this.tree;
    const suffix = this.suffix ? `+${this.suffix.toLowerCase()}` : '';
    const parameters = Object.keys(this.parameters)
      .sort()
      .map((key) => `;${key}=${this.parameters[key]}`)
      .join('');
    return `${type}/${tree}${this.subtype}${suffix}${parameters}`;
  }

  compatible(other: MediaType): boolean {
    if (
      this.type != MediaType.Type.Any &&
      other.type != MediaType.Type.Any &&
      this.type != other.type
    ) {
      return false;
    }
    if (
      this.tree != MediaType.Tree.Any &&
      other.tree != MediaType.Tree.Any &&
      this.tree != other.tree
    ) {
      return false;
    }
    if (
      this.subtype != '*' &&
      other.subtype != '*' &&
      this.subtype != other.subtype
    ) {
      return false;
    }
    if (this.suffix != other.suffix) {
      return false;
    }
    const thisKeys = Object.keys(this.parameters);
    const otherKeys = Object.keys(other.parameters);
    return thisKeys
      .filter((key) => otherKeys.includes(key))
      .every((key) => this.parameters[key] == other.parameters[key]);
  }

  equals(other: MediaType): boolean {
    if (this === other) return true;

    if (this.type != other.type) return false;
    if (this.tree != other.tree) return false;
    if (this.suffix != other.suffix) return false;
    if (this.subtype != other.subtype) return false;
    for (const parameterName of Object.keys(this.parameters)) {
      if (this.parameters[parameterName] != other.parameters[parameterName]) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    return this.value;
  }
}

export namespace MediaType {
  export enum Type {
    Application = 'application',
    Audio = 'audio',
    Example = 'example',
    Font = 'font',
    Image = 'image',
    Message = 'message',
    Model = 'model',
    Multipart = 'multipart',
    Text = 'text',
    Video = 'video',
    Any = '*',
  }

  export namespace Type {
    export function from(value: string): Type | undefined {
      return Object.values(Type).includes(value as Type)
        ? (value as Type)
        : undefined;
    }
  }

  export enum Tree {
    Standard = '',
    Vendor = 'vnd.',
    Personal = 'prs.',
    Unregistered = 'x.',
    Obsolete = 'x-',
    Any = '*',
  }

  export namespace Tree {
    export function from(value: string): Tree | undefined {
      return Object.values(Tree).includes(value as Tree)
        ? (value as Tree)
        : undefined;
    }
  }

  export enum Suffix {
    XML = 'xml',
    JSON = 'json',
    BER = 'ber',
    DER = 'der',
    FastInfoSet = 'fastinfoset',
    WBXML = 'wbxml',
    Zip = 'zip',
    CBOR = 'cbor',
  }

  export namespace Suffix {
    export function from(value: string): Suffix | undefined {
      return Object.values(Suffix).includes(value as Suffix)
        ? (value as Suffix)
        : undefined;
    }
  }

  export enum ParameterName {
    CharSet = 'charset',
  }

  export function from(value?: string | null): MediaType;
  export function from(
    value: string | null | undefined,
    def: MediaType,
  ): MediaType;
  export function from(
    value?: string | null,
    def: MediaType | undefined = undefined,
  ): MediaType {
    const reqDef = () => {
      if (!def) {
        throw Error('Invalid media type');
      }
      return def;
    };

    if (!value) {
      return reqDef();
    }

    fullRegex.lastIndex = 0;
    const match = fullRegex.exec(value);
    if (match?.[0] != value) {
      return reqDef();
    }

    const type = MediaType.Type.from(match[1]?.toLowerCase());
    if (!type) {
      return reqDef();
    }

    const tree =
      MediaType.Tree.from(match[2]?.toLowerCase()) ?? MediaType.Tree.Standard;

    const subtype = match[3]?.toLowerCase();
    if (!subtype) {
      return reqDef();
    }

    const suffix = MediaType.Suffix.from(match[4]?.toLowerCase());

    const parameters: Record<string, string> = {};

    let parametersMatch = paramRegex.exec(match[5] ?? '');
    while (parametersMatch?.[0]) {
      const name = parametersMatch[1];
      if (!name) continue;

      const value = parametersMatch[2];
      if (!value) continue;

      parameters[name.toLowerCase()] = value.toLowerCase();

      parametersMatch = paramRegex.exec(match[5]);
    }

    return new MediaType({
      type,
      tree,
      subtype,
      suffix,
      parameters,
    });
  }

  const fullRegex =
    /^((?:[a-z]+|\*))\/(x(?:-|\\.)|(?:(?:vnd|prs|x)\.)|\*)?([a-z0-9\-.]+|\*)(?:\+([a-z]+))?( *(?:; *(?:(?:[\w.-]+) *= *(?:[\w.-]+)) *)*)$/gi;
  const paramRegex = / *; *([\w.-]+) *= *([\w.-]+)/gi;

  export const Plain = new MediaType({
    type: MediaType.Type.Text,
    subtype: 'plain',
  });
  export const HTML = new MediaType({
    type: MediaType.Type.Text,
    subtype: 'html',
  });
  export const JSON = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'json',
  });
  export const YAML = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'yaml',
  });
  export const CBOR = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'cbor',
  });
  export const EventStream = new MediaType({
    type: MediaType.Type.Text,
    subtype: 'event-stream',
  });
  export const OctetStream = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'octet-stream',
  });
  export const WWWFormUrlEncoded = new MediaType({
    type: MediaType.Type.Application,
    tree: MediaType.Tree.Obsolete,
    subtype: 'www-form-urlencoded',
  });
  export const X509CACert = new MediaType({
    type: MediaType.Type.Application,
    tree: MediaType.Tree.Obsolete,
    subtype: 'x509-ca-cert',
  });
  export const X509UserCert = new MediaType({
    type: MediaType.Type.Application,
    tree: MediaType.Tree.Obsolete,
    subtype: 'x509-user-cert',
  });

  export const Any = new MediaType({
    type: MediaType.Type.Any,
    subtype: '*',
  });
  export const AnyText = new MediaType({
    type: MediaType.Type.Text,
    subtype: '*',
  });
  export const AnyImage = new MediaType({
    type: MediaType.Type.Image,
    subtype: '*',
  });
  export const AnyAudio = new MediaType({
    type: MediaType.Type.Audio,
    subtype: '*',
  });
  export const AnyVideo = new MediaType({
    type: MediaType.Type.Video,
    subtype: '*',
  });

  export const JSONStructured = new MediaType({
    type: MediaType.Type.Any,
    tree: MediaType.Tree.Any,
    subtype: '*',
    suffix: Suffix.JSON,
  });
  export const XMLStructured = new MediaType({
    type: MediaType.Type.Any,
    tree: MediaType.Tree.Any,
    subtype: '*',
    suffix: Suffix.XML,
  });

  export const Problem = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'problem',
    suffix: Suffix.JSON,
  });

  export const JsonPatch = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'json-patch',
    suffix: Suffix.JSON,
  });

  export const MergePatch = new MediaType({
    type: MediaType.Type.Application,
    subtype: 'merge-patch',
    suffix: Suffix.JSON,
  });
}
