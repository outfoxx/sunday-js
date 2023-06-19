// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ClassList, ClassType } from '@outfoxx/jackson-js/dist/@types';
import { ConstructableClassType } from './class-type';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyType = ClassList<ClassType<any>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConstructableType = ClassList<ConstructableClassType<any>>;