import { ClassType as CT } from '@outfoxx/jackson-js/dist/@types';

export type ClassType<T> = CT<T>;

export declare type ConstructableClassType<T> =
  | (new () => T)
  | (new (...args: any[]) => T); // eslint-disable-line @typescript-eslint/no-explicit-any
