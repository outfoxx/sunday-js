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

import { describe, expect, it } from 'bun:test';
import { errorToMessage } from '../src';

describe('errorToMessage', () => {
  it('returns the message for Error instances', () => {
    expect(errorToMessage(new Error('boom'))).toBe('boom');
  });

  it('uses the default message for non-Error values', () => {
    expect(errorToMessage({ code: 400 }, 'default message')).toBe('default message');
  });

  it('formats primitive values', () => {
    expect(errorToMessage('bad input')).toBe('bad input');
    expect(errorToMessage(undefined)).toBe('undefined');
    expect(errorToMessage(null)).toBe('null');
    expect(errorToMessage(true)).toBe('true');
    expect(errorToMessage(42)).toBe('42');
    expect(errorToMessage(12n)).toBe('12n');
    expect(errorToMessage(Symbol('retry'))).toBe('Symbol(retry)');
  });

  it('formats functions', () => {
    function namedHandler() {
      return undefined;
    }

    expect(errorToMessage(namedHandler)).toBe('[function namedHandler]');
    expect(errorToMessage(function () {
      return undefined;
    })).toBe('[function]');
  });

  it('formats plain objects and arrays as JSON', () => {
    expect(errorToMessage({ code: 400, reason: 'bad request' })).toBe(
      '{"code":400,"reason":"bad request"}',
    );
    expect(errorToMessage([1, 'two', false])).toBe('[1,"two",false]');
  });

  it('includes constructor names for serializable non-plain objects', () => {
    expect(errorToMessage(new URL('https://example.com/test'))).toBe(
      'URL "https://example.com/test"',
    );
  });

  it('falls back safely for circular objects', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(errorToMessage(circular)).toBe('[Object]');
  });
});
