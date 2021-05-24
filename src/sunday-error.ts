import { ResponseExample } from './fetch';

export class SundayError extends Error {
  constructor(
    message: string,
    public url: string,
    public httpVersion: string,
    public status: number,
    public statusText: string,
    public headers: Headers,
    public body: unknown | undefined,
    public responseExample: string
  ) {
    super(message);
  }

  static async fromResponse(
    message: string,
    response: Response
  ): Promise<SundayError> {
    const [bodyExcerpt, body] = await ResponseExample.bodyExcerpt(
      response,
      256
    );

    return new SundayError(
      message,
      response.url,
      '?.?',
      response.status,
      response.statusText,
      response.headers,
      body,
      ResponseExample.build(response, bodyExcerpt)
    );
  }
}
