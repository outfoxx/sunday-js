import { ResponseExample } from './fetch';
import {
  JsonAnyGetter,
  JsonAnySetter,
  JsonClassType,
  JsonCreator,
  JsonCreatorMode,
  JsonIgnore,
  JsonProperty,
} from '@outfoxx/jackson-js';

export interface ProblemSpec {
  type: URL | string;
  status: number;
  title: string;
  detail?: string;
  instance?: URL | string;
  [key: string]: unknown;
}

export interface Problem {
  type: URL;
  title: string;
  status: number;
  detail?: string;
  instance?: URL;
  [key: string]: unknown;
}

@JsonCreator({ mode: JsonCreatorMode.DELEGATING })
export class Problem extends Error implements Problem {
  @JsonProperty()
  @JsonClassType({ type: () => [URL] })
  public type: URL;

  @JsonProperty()
  @JsonClassType({ type: () => [String] })
  public title: string;

  @JsonProperty()
  @JsonClassType({ type: () => [Number] })
  public status: number;

  @JsonProperty()
  @JsonClassType({ type: () => [String] })
  public detail?: string;

  @JsonProperty()
  @JsonClassType({ type: () => [URL] })
  public instance?: URL;

  @JsonIgnore()
  private _parameters?: Record<string, unknown>;

  @JsonClassType({ type: () => [Object] })
  @JsonAnyGetter()
  public get parameters(): Record<string, unknown> | undefined {
    return this._parameters;
  }

  @JsonAnySetter()
  private setParameter(key: string, value: unknown) {
    this._parameters = this._parameters ?? {};
    this._parameters[key] = value;
  }

  constructor(spec: ProblemSpec) {
    super(`${spec.status.toString()} ${spec.type} - ${spec.title}`);

    const src = (spec as unknown) as Record<string, unknown>;

    const json = Object.assign({}, src);

    this.type = Problem.parseURL(json.type) ?? new URL('about:blank');
    delete json.type;

    this.status = json.status as number;
    delete json.status;

    this.title = json.title as string;
    delete json.title;

    this.detail = json.detail as string;
    delete json.detail;

    this.instance = Problem.parseURL(json.instance);
    delete json.instance;

    if (Object.keys(json).length != 0) {
      this._parameters = json;
    }
  }

  toString(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as Record<string, any>;
    const url = self.request ? self.request?.url : undefined;
    const response = self.response?.example;
    return JSON.stringify({
      type: this.type,
      status: this.status,
      title: this.title,
      detail: this.detail,
      instance: this.instance,
      url,
      response,
    });
  }

  static fromStatus(status: number, title: string): Problem {
    return new Problem({
      type: 'about:blank',
      title,
      status,
    });
  }

  static async fromResponse(response: Response): Promise<Problem> {
    const [bodyExcerpt, body] = await ResponseExample.bodyExcerpt(
      response,
      256
    );

    return new Problem({
      type: 'about:blank',
      title: response.statusText,
      status: response.status,
      request: {
        url: response.url,
      },
      response: {
        type: response.type,
        headers: response.headers,
        trailer: response.trailer,
        body,
        example: ResponseExample.build(response, bodyExcerpt),
      },
    });
  }

  private static parseURL(value: unknown | undefined | null): URL | undefined {
    if (value == null) {
      return undefined;
    }
    if (value instanceof URL) {
      return value;
    }
    if (typeof value == 'string') {
      return new URL(value);
    }
    return new URL(`${value}`);
  }
}
