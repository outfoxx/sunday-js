import fetchMock from 'fetch-mock';
import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { first } from 'rxjs/operators';
import { FetchRequestFactory, MediaType } from '../src';
import objectContaining = jasmine.objectContaining;

describe('FetchRequestFactory', () => {
  beforeEach(() => {
    fetchMock.reset();
  });

  const fetchRequestFactory = new FetchRequestFactory('http://example.com');

  it('replaces path template parameters', async () => {
    await expectAsync(
      fetchRequestFactory
        .request({
          method: 'GET',
          pathTemplate: '/api/{id}/contents',
          pathParameters: { id: '12345' },
        })
        .pipe(first())
        .toPromise()
    ).toBeResolvedTo(
      objectContaining({ url: 'http://example.com/api/12345/contents' })
    );
  });

  it('adds encoded query parameters', async () => {
    await expectAsync(
      fetchRequestFactory
        .request({
          method: 'GET',
          pathTemplate: '/api/{id}/contents',
          pathParameters: { id: '12345' },
          queryParameters: {
            limit: 5,
            search: '1 & 2',
          },
        })
        .pipe(first())
        .toPromise()
    ).toBeResolvedTo(
      objectContaining({
        url: 'http://example.com/api/12345/contents?limit=5&search=1%20%26%202',
      })
    );
  });

  it('attaches encoded body based on content-type', async () => {
    const request: Request = await fetchRequestFactory
      .request({
        method: 'POST',
        pathTemplate: '/api/contents',
        body: { a: 5 },
        bodyType: [Object],
        contentTypes: [MediaType.JSON],
      })
      .pipe(first())
      .toPromise();
    expect(request.url).toBe('http://example.com/api/contents');
    await expectAsync(request.text()).toBeResolvedTo('{"a":5}');
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.toString());
  });

  it('attaches encoded content-type when body is nil', async () => {
    const request: Request = await fetchRequestFactory
      .request({
        method: 'POST',
        pathTemplate: '/api/contents',
        body: { a: 5 },
        bodyType: [Object],
        contentTypes: [MediaType.JSON],
      })
      .pipe(first())
      .toPromise();
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON.toString());
  });

  it('fetches typed results', async () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number
      ) {}
    }

    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub
      ) {}
    }

    fetchMock.getOnce('http://example.com', {
      body: '{"test":"a","sub":{"value":5}}',
      headers: { 'content-type': MediaType.JSON },
    });

    expect(
      await fetchRequestFactory
        .result({ method: 'GET', pathTemplate: '' }, [Test])
        .pipe(first())
        .toPromise()
    ).toEqual(new Test('a', new Sub(5)));
  });
});
