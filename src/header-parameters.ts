export namespace HeaderParameters {
  export function encode(
    parameters?: Record<string, unknown>
  ): [string, string][] {
    if (parameters == null) {
      return [];
    }

    const headers: [string, string][] = [];

    Object.entries(parameters).forEach(([name, parameter]) => {
      for (const value of encodeParam(name, parameter)) {
        headers.push([name, value]);
      }
    });

    return headers;
  }

  function encodeParam(name: string, value: unknown): string[] {
    if (value == null) {
      return [];
    }

    if (value instanceof Array) {
      const result: string[] = [];

      for (const item of value) {
        if (item == null) {
          continue;
        }

        result.push(validate(name, `${item}`));
      }

      return result;
    }

    return [validate(name, `${value}`)];
  }

  const asciiRegex = /^[\x20-\x7F]*$/;

  function validate(name: string, value: string): string {
    if (!asciiRegex.test(value)) {
      throw new Error(
        `The encoded header value contains one or more invalid characters: header=${name}, value=${value}`
      );
    }
    return value;
  }
}
