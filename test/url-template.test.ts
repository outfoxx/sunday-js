import { URLTemplate } from '../src/url-template';

describe('URLTemplate', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('replaces path template parameters', () => {
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
    });
    expect(
      base
        .complete('/contents/{id}', {
          id: '12345',
          env: 'stg',
        })
        .toString()
    ).toBe('http://stg.example.com/api/v1/contents/12345');
  });

  it('overrides base parameters with relative parameters', () => {
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
    });
    expect(
      base
        .complete('/contents/{id}', { id: '12345', env: 'stg', ver: 2 })
        .toString()
    ).toBe('http://stg.example.com/api/v2/contents/12345');
  });

  it('generates concatenated relative urls', () => {
    // base & relative has slashes
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base.complete('/contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345'
    );

    // only relative has a slash
    const base2 = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
      env: 'stg',
    });
    expect(base2.complete('/contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345'
    );

    // only base has a slash
    const base3 = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base3.complete('contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345'
    );

    // neither base or relative has slashes
    const base4 = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
      env: 'stg',
    });
    expect(base4.complete('contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345'
    );
  });

  it('generates urls with no relative portion', () => {
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base.complete('', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1'
    );
  });
});
