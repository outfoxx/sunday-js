import { JsonClassType, JsonProperty } from '@outfoxx/jackson-js';
import { first } from 'rxjs/operators';
import { FetchRequestManager } from '../src';
import { MediaType } from '../src/media-type';



describe('FetchRequestManager', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  const fetchReqMgr = new FetchRequestManager('http://example.com');

  it('replaces path template parameters', async () => {
    await expect(
      fetchReqMgr
        .request({
                   method: 'GET',
                   pathTemplate: '/api/{id}/contents',
                   pathParameters: { id: '12345' },
                 })
        .pipe(first())
        .toPromise(),
    ).resolves.toMatchObject({ url: 'http://example.com/api/12345/contents' });
  });

  it('generates normalized urls', async () => {
    const fetchReqMgr = new FetchRequestManager('http://example.com/api/v{ver}');
    await expect(
      fetchReqMgr
        .request({
                   method: 'GET',
                   pathTemplate: '/{id}/contents',
                   pathParameters: { id: '12345', ver: 1 },
                 })
        .pipe(first())
        .toPromise(),
    ).resolves.toMatchObject({ url: 'http://example.com/api/v1/12345/contents' });

    const fetchReqMgr2 = new FetchRequestManager('http://example.com/api/v{ver}');
    await expect(
      fetchReqMgr2
        .request({
                   method: 'GET',
                   pathTemplate: '{id}/contents',
                   pathParameters: { id: '12345', ver: 1 },
                 })
        .pipe(first())
        .toPromise(),
    ).resolves.toMatchObject({ url: 'http://example.com/api/v1/12345/contents' });

    const fetchReqMgr3 = new FetchRequestManager('http://example.com/api/v{ver}/');
    await expect(
      fetchReqMgr3
        .request({
                   method: 'GET',
                   pathTemplate: '/{id}/contents',
                   pathParameters: { id: '12345', ver: 1 },
                 })
        .pipe(first())
        .toPromise(),
    ).resolves.toMatchObject({ url: 'http://example.com/api/v1/12345/contents' });

    const fetchReqMgr4 = new FetchRequestManager('http://example.com/api/v{ver}/');
    await expect(
      fetchReqMgr4
        .request({
                   method: 'GET',
                   pathTemplate: '{id}/contents',
                   pathParameters: { id: '12345', ver: 1 },
                 })
        .pipe(first())
        .toPromise(),
    ).resolves.toMatchObject({ url: 'http://example.com/api/v1/12345/contents' });
  });

  it('adds encoded query parameters', async () => {
    await expect(
      fetchReqMgr
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
        .toPromise(),
    ).resolves.toMatchObject({
                               url: 'http://example.com/api/12345/contents?limit=5&search=1%20%26%202',
                             });
  });

  it('attaches encoded body based on content-type', async () => {
    const request: Request = await fetchReqMgr
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
    await expect(request.text()).resolves.toBe('{"a":5}');
    expect(request.headers.get('Content-Type')).toBe(MediaType.JSON);
  });

  it('fetches typed results', async () => {
    //
    class Sub {
      constructor(
        @JsonProperty()
        public value: number,
      ) {
      }
    }


    class Test {
      constructor(
        @JsonProperty()
        public test: string,
        @JsonProperty()
        @JsonClassType({ type: () => [Sub] })
        public sub: Sub,
      ) {
      }
    }


    fetchMock.mockResponseOnce('{"test":"a","sub":{"value":5}}', {
      headers: { 'Content-Type': MediaType.JSON },
    });

    await expect(
      fetchReqMgr
        .result({ method: 'GET', pathTemplate: '' }, [Test])
        .pipe(first())
        .toPromise(),
    ).resolves.toStrictEqual(new Test('a', new Sub(5)));
  });
});
