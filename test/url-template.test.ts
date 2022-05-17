// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { URLTemplate } from '../src';

describe('URLTemplate', () => {
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
