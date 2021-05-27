export type ClassType<T> =
  | (abstract new () => T) // eslint-disable-line prettier/prettier
  | (abstract new (...args: any[]) => T); // eslint-disable-line @typescript-eslint/no-explicit-any

export declare type ConstructableClassType<T> =
  | (new () => T) // eslint-disable-line prettier/prettier
  | (new (...args: any[]) => T); // eslint-disable-line @typescript-eslint/no-explicit-any
