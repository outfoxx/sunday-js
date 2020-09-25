export namespace Hex {
  export function decode(hex: string): ArrayBuffer {
    const values = hex.match(/[\da-f]{2}/gi);
    if (!values) {
      throw Error('Invalid hex string');
    }
    return new Uint8Array(values.map((b) => parseInt(b, 16))).buffer;
  }

  export function encode(buffer: ArrayBuffer, separator = ''): string {
    return Array.from(new Uint8Array(buffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join(separator);
  }
}
