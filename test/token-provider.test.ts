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
import {
  providerCredentials,
  TokenProviderError,
  AuthorizationRequiredError,
  type TokenRequest,
} from '../src/token-provider';
import { RequestCancellationError } from '../src/request-cancellation-error';
import type { SecurityBinding } from '../src/security-binding';

const binding: SecurityBinding = {
  scheme: 'test',
  provider: 'test',
  flow: 'external',
  scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

describe('receipt credential errors', () => {
  for (const phase of ['credentials', 'invalidate']) {
    for (const error of [
      new Error('secret'),
      new RequestCancellationError('stop'),
      new AuthorizationRequiredError(),
      new TokenProviderError('temporary'),
    ]) {
      it(`${phase}: handles ${error.name} at the provider boundary`, async () => {
        const lease = {
          key: 'original',
          tokens: { accessToken: 'token' },
          invalidate: async () => {
            throw error;
          },
        };
        const provider = {
          identity: 'test',
          configure: () => ({ clientIdentity: 'test' }),
          acquire: async () => ({ accessToken: 'unused' }),
          credentials: async () => {
            if (phase === 'credentials') throw error;
            return lease;
          },
        };
        const operation = async () => {
          const result = await providerCredentials(
            provider,
            binding,
            new AbortController().signal,
          );
          expect(result.key).toBe(lease.key);
          expect(result.tokens).toBe(lease.tokens);
          return result.invalidate!();
        };
        const caught = await operation().catch((value) => value);
        if (error.message === 'secret') {
          expect(caught).toBeInstanceOf(TokenProviderError);
          expect(caught).not.toBe(error);
          expect(caught.cause).toBeUndefined();
          expect(caught.message).not.toContain('secret');
        } else expect(caught).toBe(error);
      });
    }
  }
  it('preserves the receipt receiver and false invalidation result', async () => {
    const original = {
      key: 'original',
      tokens: { accessToken: 'token' },
      async invalidate() {
        expect(this).toBe(original);
        return false;
      },
    };
    const provider = {
      identity: 'test',
      configure: () => ({ clientIdentity: 'test' }),
      acquire: async () => ({ accessToken: 'unused' }),
      credentials: async () => original,
    };
    const lease = await providerCredentials(
      provider,
      binding,
      new AbortController().signal,
    );
    expect(await lease.invalidate!()).toBe(false);
  });
  it('preserves caller cancellation while receipt acquisition settles', async () => {
    const abort = new AbortController();
    const reason = new Error('caller stop');
    const provider = {
      identity: 'test',
      configure: () => ({ clientIdentity: 'test' }),
      acquire: async () => ({ accessToken: 'unused' }),
      credentials: async () => {
        abort.abort(reason);
        throw new Error('secret');
      },
    };
    expect(
      await providerCredentials(provider, binding, abort.signal).catch(
        (error) => error,
      ),
    ).toBe(reason);
  });
});

it('normalizes provider scopes in locale-independent order without changing the binding', async () => {
  const scopes = ['read', 'Write', 'read', 'admin'];
  let received: readonly string[] | undefined;
  await providerCredentials(
    {
      identity: 'test',
      configure: () => ({ clientIdentity: 'test' }),
      acquire: async (request: TokenRequest) => {
        received = request.scopes;
        return { accessToken: 'token' };
      },
    },
    { ...binding, scopes },
    new AbortController().signal,
  );
  expect(received).toEqual(['Write', 'admin', 'read']);
  expect(Object.isFrozen(received)).toBe(true);
  expect(scopes).toEqual(['read', 'Write', 'read', 'admin']);
});
