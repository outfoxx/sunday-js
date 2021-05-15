import fetchMock from 'fetch-mock';
import { first } from 'rxjs/operators';
import {
  FetchRequestFactory,
  MediaType,
  nullifyNotFound,
  Problem,
} from '../src';

describe('RxJS Utils', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  it('nullifyNofFound translates 404 problems to null', async () => {
    fetchMock.getOnce('http://example.com', {
      body: Problem.fromStatus(404, 'Not Found'),
      status: 404,
      headers: { 'content-type': MediaType.ProblemJSON.value },
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      fetchRequestFactory
        .result({ method: 'GET', pathTemplate: '' })
        .pipe(nullifyNotFound(), first())
        .toPromise()
    ).toBeResolved(jasmine.empty());
  });

  it('nullifyNofFound passes other errors', async () => {
    fetchMock.getOnce('http://example.com', {
      throws: Error('Failed to send request'),
    });

    const fetchRequestFactory = new FetchRequestFactory('http://example.com');

    await expectAsync(
      fetchRequestFactory
        .result({ method: 'GET', pathTemplate: '' })
        .pipe(nullifyNotFound(), first())
        .toPromise()
    ).toBeRejectedWithError(Error, /Failed to send request/i);
  });
});
