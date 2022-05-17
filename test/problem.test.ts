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

import { JSONDecoder, JSONEncoder, Problem } from '../src';

describe('Problem', () => {
  it('serializes parameters on root object', () => {
    const problem = new Problem({
      type: new URL('http://example.com/test'),
      title: 'Test Problem',
      status: 400,
      detail: 'Some Details',
      instance: new URL('id:12345'),
      extra: 'An Extra Value',
    });

    const problemJSON = JSONEncoder.default.encodeObject(problem);

    expect(problemJSON.extra).toBe(problem.parameters?.extra);

    const decodedProblem = JSONDecoder.default.decodeObject<Problem>(
      problemJSON,
      [Problem]
    );

    expect(decodedProblem).toEqual(problem);
    expect(decodedProblem.parameters).toEqual(problem.parameters);
  });
});
