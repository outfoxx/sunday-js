export class HttpError extends Error {
  constructor(
    message: string,
    public url: string,
    public httpVersion: string,
    public status: number,
    public statusText: string,
    public headers: Headers,
    public body?: string
  ) {
    super(message);
  }

  static async fromResponse(
    message: string,
    response: Response
  ): Promise<HttpError> {
    let body: string | undefined;
    try {
      if (response.headers.get('content-type')?.startsWith('text/')) {
        body = await response.text();
      } else {
        const blob = await response.blob();
        body = `<binary data: ${blob.size} bytes>`;
      }
    } catch (e) {
      // ignore errors
      body = '<unable to show response data>';
    }
    if (body.length > 512) {
      body = `${body.slice(0, 512)}<<... another ${body.length - 512} bytes>>`;
    }
    const fullMessage = `${message}
    
    ########## BEGIN REQUEST ##########
    
    HTTP/?.? ${response.status} ${response.statusText}
    ${Array.from(response.headers.entries())
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n')}
    ${body ?? '<none>'}
    
    ########### END REQUEST ###########  
    `;
    return new HttpError(
      fullMessage,
      response.url,
      '?.?',
      response.status,
      response.statusText,
      response.headers,
      body
    );
  }
}
