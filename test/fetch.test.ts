import fetchMock from 'fetch-mock';
import { catchError } from 'rxjs/operators';
import { FetchRequestFactory, HttpError, MediaType } from '../src';
import any = jasmine.any;

describe('Fetch API Utilities', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('validate throws HttpErrors', async () => {
    fetchMock.getOnce(
      'http://example.com/test',
      new Response('<html>Error</html>', {
        status: 400,
        statusText: 'BAD REQUEST',
        headers: { 'content-type': MediaType.HTML },
      })
    );

    const requestFactory = new FetchRequestFactory('http://example.com');
    await expectAsync(
      requestFactory
        .response({ method: 'GET', pathTemplate: '/test' }, true)
        .pipe(
          catchError((err) => {
            throw err;
          })
        )
        .toPromise()
    ).toBeRejectedWith(any(HttpError));
  });
});
