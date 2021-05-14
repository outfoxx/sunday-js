import { MediaType } from './media-type';
import { HttpError } from './http-error';
import { Problem } from './problem';

export async function validate(
  response: Response,
  dataExpected: boolean
): Promise<Response> {
  if (response.status < 200 || response.status >= 300) {
    if (
      MediaType.from(response.headers.get('content-type')) !==
      MediaType.ProblemJSON
    ) {
      await response.body?.cancel?.();
      throw await HttpError.fromResponse(
        'Unacceptable response status code',
        response
      );
    }

    const problemData = await response.json();

    throw new Problem(problemData as Problem);
  }

  if (dataExpected && (response.status === 204 || response.status === 205)) {
    throw await HttpError.fromResponse('Unexpected empty response', response);
  }

  return response;
}
