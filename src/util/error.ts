export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function errorToMessage(value: unknown, defMsg?: string): string {
  return isError(value) ? value.message : defMsg ?? `${fmtMsg(value)}`;
}

function fmtMsg(value: unknown): string {
  if (value instanceof Object) {
    return JSON.stringify(value);
  }
  return `${value}`;
}
