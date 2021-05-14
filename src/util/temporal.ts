export function secondsToNumber(seconds: number, nanos: number): number {
  if (nanos == 0) {
    return seconds;
  }
  const nanoStr = nanos.toString();
  return parseFloat(`${seconds}.${'0'.repeat(9 - nanoStr.length)}${nanos}`);
}

export function encodeSeconds(seconds: number, fraction: number): unknown[] {
  const result = [];
  if (seconds != 0 || fraction != 0) {
    result.push(seconds);
    if (fraction != 0) {
      result.push(fraction);
    }
  }
  return result;
}
