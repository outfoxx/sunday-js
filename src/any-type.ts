import { ClassList, ClassType } from '@outfoxx/jackson-js/dist/@types';
import { ConstructableClassType } from './class-type';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyType = ClassList<ClassType<any>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConstructableType = ClassList<ConstructableClassType<any>>;
