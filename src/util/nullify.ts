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

import { z } from 'zod';
import { Problem } from '../problem.js';

export type ProblemMatcher = z.ZodType<Problem> | ((problem: Problem) => boolean);

export async function nullifyNotFound<T>(promise: Promise<T>): Promise<T | null> {
  return await nullifyProblem(promise, [404], []);
}

export async function nullifyProblem<T>(
  promise: Promise<T>,
  statuses: number[],
  problemTypes: ProblemMatcher[],
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Problem && matchesProblem(error, statuses, problemTypes)) {
      return null;
    }
    throw error;
  }
}

function matchesProblem(
  error: Problem,
  statuses: number[],
  problemTypes: ProblemMatcher[],
): boolean {
  if (statuses.includes(error.status)) {
    return true;
  }

  return problemTypes.some((matcher) =>
    typeof matcher === 'function'
      ? matcher(error)
      : matcher.safeParse(error).success,
  );
}
