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
