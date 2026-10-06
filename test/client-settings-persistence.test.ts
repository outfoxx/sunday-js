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

import { expect, test } from 'bun:test';
import { ClientSettings, SecurityBinding, TokenManager, TokenManagerFactory, TokenProvider, TokenSet, TokenStore } from '../src';

const binding: SecurityBinding = {
  scheme: 'identity', provider: 'resolved-provider', flow: 'authorizationCode', profile: 'development', scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

test('settings factory preserves application sessions, rotation, isolation and logout', async () => {
  const values = new Map<string, TokenSet>();
  let reads = 0;
  let saves = 0;
  let acquisitions = 0;
  const refreshes: string[] = [];
  let factories = 0;
  const store: TokenStore = {
    load: async key => { reads++; return values.get(key); },
    save: async (key, tokens) => { saves++; values.set(key, tokens); },
    remove: async key => { values.delete(key); },
  };
  function settings(time: number, session = 'session', profile = 'development', direct = false) {
    const provider: TokenProvider = {
      identity: 'application', configure: () => ({ clientIdentity: 'client', grantIdentity: session }),
      acquire: async () => { acquisitions++; return { accessToken: 'initial', refreshToken: 'refresh-1', expiresAt: 100 }; },
      refresh: async (_, refreshToken) => {
        refreshes.push(refreshToken);
        return { accessToken: `rotated-${refreshes.length}`, refreshToken: `refresh-${refreshes.length + 1}`, expiresAt: time + 100 };
      },
    };
    const factory: TokenManagerFactory = providers => {
      factories++;
      expect(Object.keys(providers)).toEqual(['resolved-provider']);
      expect(providers['resolved-provider']).toBe(provider);
      return new TokenManager(providers, { store, expirySkewMs: 5, now: () => time });
    };
    const selected = { ...binding, profile };
    const credentials = { identity: { kind: 'provider' as const, provider } };
    return direct
      ? new ClientSettings('https://api.example', { read: [selected], other: [selected] }, credentials, factory)
      : ClientSettings.resolve('https://api.example', { read: [[selected]], other: [[selected]], public: [[]] }, credentials, {}, {}, factory);
  }
  const first = settings(0);
  expect([reads, saves, acquisitions, factories]).toEqual([0, 0, 0, 1]);
  const lease = await first.tokenManager!.credentials(first.bindings.read[0]);
  expect(lease.tokens.accessToken).toBe('initial');
  const second = settings(0, 'session', 'development', true);
  expect((await second.tokenManager!.credentials(second.bindings.read[0])).tokens.accessToken).toBe('initial');
  expect(acquisitions).toBe(1);
  const third = settings(96);
  const tokens = await Promise.all(Array.from({ length: 20 }, () => third.tokenManager!.credentials(third.bindings.read[0])));
  expect(tokens.every(value => value.tokens.accessToken === 'rotated-1')).toBe(true);
  expect(refreshes).toEqual(['refresh-1']);
  const fourth = settings(96);
  expect((await fourth.tokenManager!.credentials(fourth.bindings.read[0])).tokens.refreshToken).toBe('refresh-2');
  const fifth = settings(192);
  await fifth.tokenManager!.credentials(fifth.bindings.read[0]);
  expect(refreshes).toEqual(['refresh-1', 'refresh-2']);
  expect(saves).toBe(3);
  for (const isolated of [settings(0, 'other-session'), settings(0, 'session', 'production')]) {
    await isolated.tokenManager!.credentials(isolated.bindings.read[0]);
  }
  expect(acquisitions).toBe(3);
  await store.remove(lease.key);
  const reset = settings(0);
  await reset.tokenManager!.credentials(reset.bindings.read[0]);
  expect(acquisitions).toBe(4);
});

test('public and invalid settings do not call a manager factory; factory errors propagate', () => {
  const factory: TokenManagerFactory = () => { throw new Error('application factory failed'); };
  expect(new ClientSettings('https://api.example', {}, {}, factory).tokenManager).toBeUndefined();
  expect(ClientSettings.resolve('https://api.example', { public: [[]] }, {}, {}, {}, factory).tokenManager).toBeUndefined();
  expect(() => new ClientSettings('https://api.example', { read: [binding] }, {}, factory)).toThrow('Missing credentials');
  expect(() => new ClientSettings('https://api.example', { read: [{ ...binding, flow: 'static' }] },
    { identity: { kind: 'bearer', token: 'secret' } }, factory)).toThrow('application factory failed');
});
