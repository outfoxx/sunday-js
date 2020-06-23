import { mediaType, MediaType } from './media-type';
import { HttpError } from './http-error';
import { Problem } from './problem';

export async function validate(
  response: Response,
  valueExpected: boolean
): Promise<Response> {
  if (response.status < 200 || response.status >= 300) {
    if (
      mediaType(response.headers.get('content-type')) !== MediaType.PROBLEM_JSON
    ) {
      await response.body?.cancel();
      throw new HttpError(
        'Unacceptable response status code',
        response.status,
        response.statusText
      );
    }

    const problemData = await response.json();

    throw new Problem(problemData as Problem);
  }

  if (valueExpected && (response.status === 204 || response.status === 205)) {
    throw new HttpError(
      'Unexpected empty response',
      response.status,
      response.statusText
    );
  }

  return response;
}
