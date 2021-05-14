import { ResponseExample } from './fetch';

export interface Problem {
  type: URL;
  status: number;
  title: string;
  detail: string;
  instance?: URL;
  [key: string]: unknown;
}

export class Problem extends Error implements Problem {
  public type: URL;
  public status: number;
  public title: string;
  public detail: string;
  public instance?: URL;

  constructor(src: Record<string, unknown>) {
    super(`${src.status} ${src.type} - ${src.title}`);

    const json = Object.assign({}, src);

    this.type = Problem.parseURL(this.type) ?? new URL('about:blank');
    delete json.type;

    this.status = json.status as number;
    delete json.status;

    this.title = json.title as string;
    delete json.title;

    this.detail = json.detail as string;
    delete json.detail;

    this.instance = Problem.parseURL(json.instance);
    delete json.instance;

    Object.assign(this, json);
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

  static async fromResponse(response: Response): Promise<Problem> {
    const [bodyExcerpt, body] = await ResponseExample.bodyExcerpt(
      response,
      256
    );

    return new Problem({
      type: 'about:blank',
      status: response.status,
      title: response.statusText,
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
