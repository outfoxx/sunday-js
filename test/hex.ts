export function bytesFromHex(hex: string): Uint8Array {
  const values = hex.match(/[\da-f]{2}/gi);
  if (!values) {
    throw Error('Invalid hex string');
  }
  return new Uint8Array(values.map((b) => parseInt(b, 16)));
}

export function bufferFromHex(hex: string): ArrayBuffer {
  const values = hex.match(/[\da-f]{2}/gi);
  if (!values) {
    throw Error('Invalid hex string');
  }
  return new Uint8Array(values.map((b) => parseInt(b, 16))).buffer;
}
