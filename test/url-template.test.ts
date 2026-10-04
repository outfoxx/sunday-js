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

import { describe, it, expect } from 'bun:test';
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
        .toString(),
    ).toBe('http://stg.example.com/api/v1/contents/12345');
  });

  it('overrides base parameters with relative parameters', () => {
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
    });
    expect(
      base
        .complete('/contents/{id}', { id: '12345', env: 'stg', ver: 2 })
        .toString(),
    ).toBe('http://stg.example.com/api/v2/contents/12345');
  });

  it('generates concatenated relative urls', () => {
    // base & relative has slashes
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base.complete('/contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345',
    );

    // only relative has a slash
    const base2 = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
      env: 'stg',
    });
    expect(base2.complete('/contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345',
    );

    // only base has a slash
    const base3 = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base3.complete('contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345',
    );

    // neither base or relative has slashes
    const base4 = new URLTemplate('http://{env}.example.com/api/v{ver}', {
      ver: 1,
      env: 'stg',
    });
    expect(base4.complete('contents/{id}', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1/contents/12345',
    );
  });

  it('generates urls with no relative portion', () => {
    const base = new URLTemplate('http://{env}.example.com/api/v{ver}/', {
      ver: 1,
      env: 'stg',
    });
    expect(base.complete('', { id: '12345' }).toString()).toBe(
      'http://stg.example.com/api/v1',
    );
  });

  it.each(['{/id}', '{/id*}', '{/id:3}', '{/missing,id,other}'])(
    'preserves an empty path segment for %s',
    (expression) => {
      const template = new URLTemplate(
        `https://example.com/items${expression}`,
      );
      expect(template.complete('', { id: '' }).href).toBe(
        'https://example.com/items/',
      );
    },
  );

  it.each([
    [{}, ''],
    [{ id: undefined }, ''],
    [{ id: null }, ''],
    [{ id: [] }, ''],
    [{ id: {} }, ''],
    [{ id: { unused: null } }, ''],
    [{ id: [''] }, '/'],
    [{ id: ['', ''] }, '//'],
    [{ id: ['one', '', 'two'] }, '/one//two'],
    [{ id: 'one/two' }, '/one%2Ftwo'],
    [{ id: false }, '/false'],
    [{ id: 0 }, '/0'],
  ] as const)('expands path values %j as %s', (parameters, suffix) => {
    const template = new URLTemplate('https://example.com/items{/id*}');
    expect(template.complete('', parameters).href).toBe(
      `https://example.com/items${suffix}`,
    );
  });

  it('preserves empty non-exploded collection values', () => {
    const template = new URLTemplate('https://example.com/items{/id}');
    expect(template.complete('', { id: [''] }).href).toBe(
      'https://example.com/items/',
    );
    expect(template.complete('', { id: ['', ''] }).href).toBe(
      'https://example.com/items/,',
    );
  });

  it('preserves separators between defined values', () => {
    const template = new URLTemplate(
      'https://example.com/items{/missing,first,id,last,nil}',
    );
    expect(
      template.complete('', { first: 'one', id: '', last: 'two', nil: null })
        .href,
    ).toBe('https://example.com/items/one//two');
  });

  it('expands repeated variables in base and relative templates without changing inputs', () => {
    const defaults = Object.freeze({ id: '123' });
    const overrides = Object.freeze({ id: '' });
    const template = new URLTemplate('https://example.com/base{/id}', defaults);
    expect(template.complete('/items{/id}', overrides).href).toBe(
      'https://example.com/base//items/',
    );
    expect(template.complete('/items{/id}', { id: null }).href).toBe(
      'https://example.com/base/items',
    );
    expect(template.complete('/items{/id}', {}).href).toBe(
      'https://example.com/base/123/items/123',
    );
  });

  it.each([
    ['', ''],
    ['+', ''],
    ['#', '#'],
    ['.', '.'],
    ['/', '/'],
    [';', ';id'],
    ['?', '?id='],
    ['&', '&id='],
  ])(
    'distinguishes empty from undefined for operator %s',
    (operator, suffix) => {
      const template = new URLTemplate(
        `https://example.com/items{${operator}id}`,
      );
      expect(template.complete('', { id: '' }).href).toBe(
        `https://example.com/items${suffix}`,
      );
      expect(template.complete('', { id: null }).href).toBe(
        'https://example.com/items',
      );
      expect(template.complete('', {}).href).toBe('https://example.com/items');
    },
  );

  it.each(['/items{/id', '/items{/id?}', '/items{}'])(
    'continues rejecting malformed templates: %s',
    (path) => {
      expect(() =>
        new URLTemplate('https://example.com').complete(path, { id: '' }),
      ).toThrow();
    },
  );
});
