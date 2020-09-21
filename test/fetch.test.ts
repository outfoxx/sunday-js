import { catchError } from 'rxjs/operators';
import { FetchRequestFactory, HttpError, MediaType } from '../src';

describe('Fetch API Utilities', () => {
  beforeAll(() => {
    jest.resetAllMocks();
    fetchMock.resetMocks();
  });

  it('validate throws HttpErrors', async () => {
    fetchMock.mockResponse('<html>Error</html>', {
      status: 400,
      statusText: 'BAD REQUEST',
      headers: { 'content-type': MediaType.HTML },
      url: 'http://example.com',
    });

    const requestFactory = new FetchRequestFactory('http://example.com');
    await expect(() =>
      requestFactory
        .response({ method: 'GET', pathTemplate: '/test' }, true)
        .pipe(
          catchError((err) => {
            console.log(err);
            throw err;
          })
        )
        .toPromise()
    ).rejects.toBeInstanceOf(HttpError);
  });
});
