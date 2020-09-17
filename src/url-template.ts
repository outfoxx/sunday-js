import { URI } from 'uri-template-lite';

export class URLTemplate {
  constructor(
    public template: string,
    public parameters: Record<string, unknown> = {}
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

    return new URL(URI.expand(baseTempl + relTempl, allParameters));
  }
}
