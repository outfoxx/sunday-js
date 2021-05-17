import { MockResponse } from 'fetch-mock';

export function delayedResponse(
  response: MockResponse,
  after: number
): Promise<MockResponse> {
  return new Promise((resolve) => setTimeout(resolve, after)).then(
    () => response
  );
}
