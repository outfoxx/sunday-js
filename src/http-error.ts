export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: string,
    public headers?: Headers
  ) {
    super(message);
  }

  static async fromResponse(
    message: string,
    response: Response
  ): Promise<HttpError> {
    let body: string | undefined = undefined;
    if (response.headers.get('content-type')?.startsWith('text/')) {
      body = await response.text();
    }
    return new HttpError(
      message,
      response.status,
      response.statusText,
      body,
      response.headers
    );
  }
}
