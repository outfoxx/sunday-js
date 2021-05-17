export function unknownGet<T = unknown>(obj: unknown, key: string): T {
  return (obj as Record<string, unknown>)?.[key] as T;
}

export function unknownSet<T>(obj: unknown, key: string, value: T): void {
  if (obj == null) {
    return;
  }
  (obj as Record<string, unknown>)[key] = value;
}
