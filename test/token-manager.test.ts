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
  AuthorizationRequiredError, SecurityBinding, TokenConfiguration, TokenManager,
  TokenProvider, TokenProviderError, TokenRequest, TokenSet, TokenStore,
} from '../src';

const binding: SecurityBinding = {
  scheme: 'token', provider: 'identity', profile: 'external', flow: 'clientCredentials',
  scopes: ['read'], tokenUrl: 'https://identity.example/token',
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class Provider implements TokenProvider {
  identity = 'application-provider';
  configuration: TokenConfiguration = { clientIdentity: 'client', grantIdentity: 'session' };
  acquired: TokenRequest[] = [];
  refreshed: string[] = [];
  next: TokenSet = { accessToken: 'first', expiresAt: 2_000, refreshToken: 'refresh-first' };
  configure(): TokenConfiguration { return this.configuration; }
  async acquire(request: TokenRequest): Promise<TokenSet> { this.acquired.push(request); return this.next; }
  async refresh(_request: TokenRequest, refreshToken: string): Promise<TokenSet> {
    this.refreshed.push(refreshToken);
    return this.next;
  }
}

describe('token lifecycle', () => {
  it('acquires once, caches until skew, and rotates refresh tokens', async () => {
    let now = 1_000;
    const provider = new Provider();
    const manager = new TokenManager({ identity: provider }, { now: () => now, expirySkewMs: 100 });
    expect((await manager.credentials(binding)).tokens.accessToken).toBe('first');
    now = 1_899;
    expect((await manager.credentials(binding)).tokens.accessToken).toBe('first');
    expect(provider.acquired).toHaveLength(1);
    provider.next = { accessToken: 'second', expiresAt: 3_000, refreshToken: 'refresh-second' };
    now = 1_900;
    expect((await manager.credentials(binding)).tokens.accessToken).toBe('second');
    provider.next = { accessToken: 'third', expiresAt: 4_000 };
    now = 2_900;
    const third = await manager.credentials(binding);
    expect(third.tokens.refreshToken).toBe('refresh-second');
    expect(provider.refreshed).toEqual(['refresh-first', 'refresh-second']);
  });

  it('reacquires client credentials without refresh and requires fresh authorization for an expired interactive session', async () => {
    let now = 1_000;
    const provider = new Provider();
    provider.next = { accessToken: 'first', expiresAt: 2_000 };
    const manager = new TokenManager({ identity: provider }, { now: () => now, expirySkewMs: 0 });
    await manager.credentials(binding);
    const interactive = { ...binding, flow: 'authorizationCode' as const };
    await manager.credentials(interactive);
    now = 2_000;
    provider.next = { accessToken: 'next', expiresAt: 3_000 };
    await manager.credentials(binding);
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    expect(provider.acquired).toHaveLength(3);
    provider.configuration = { clientIdentity: 'client', grantIdentity: 'fresh-session' };
    expect((await manager.credentials(interactive)).tokens.accessToken).toBe('next');
    expect(provider.acquired).toHaveLength(4);
  });

  it('requires fresh authorization after a failed initial exchange', async () => {
    const provider = new Provider();
    let calls = 0;
    provider.acquire = async () => { calls++; throw new Error('SECRET'); };
    const manager = new TokenManager({ identity: provider });
    const interactive = { ...binding, flow: 'authorizationCode' as const };
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(TokenProviderError);
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    expect(calls).toBe(1);
    provider.configuration = { clientIdentity: 'client', grantIdentity: 'fresh-session' };
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(TokenProviderError);
    expect(calls).toBe(2);
  });

  it('keeps refresh state during invalidation and does not invalidate a concurrently renewed token', async () => {
    const provider = new Provider();
    const manager = new TokenManager({ identity: provider }, { now: () => 1_000, expirySkewMs: 0 });
    const initial = await manager.credentials(binding);
    await manager.invalidate(initial);
    provider.next = { accessToken: 'second', expiresAt: 3_000, refreshToken: 'refresh-second' };
    const renewed = await manager.credentials(binding);
    await manager.invalidate(initial);
    expect((await manager.credentials(binding)).tokens).toEqual(renewed.tokens);
    expect(provider.refreshed).toEqual(['refresh-first']);
    expect(provider.acquired).toHaveLength(1);
  });

  it('invalidated interactive credentials without refresh cannot acquire the old authorization again', async () => {
    const provider = new Provider();
    provider.next = { accessToken: 'first' };
    const manager = new TokenManager({ identity: provider }, { now: () => 1_000 });
    const interactive = { ...binding, flow: 'authorizationCode' as const };
    const initial = await manager.credentials(interactive);
    await manager.invalidate(initial);
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    expect(provider.acquired).toHaveLength(1);
  });

  it('isolates every applicability input while treating scope order as irrelevant', async () => {
    const provider = new Provider();
    const manager = new TokenManager({ identity: provider }, { now: () => 1_000, expirySkewMs: 0 });
    const baseline = await manager.credentials(binding);
    for (const change of [
      { scheme: 'another-scheme' }, { profile: 'internal' }, { tokenUrl: 'https://internal.example/token' },
      { refreshUrl: 'https://identity.example/refresh' }, { discoveryUrl: 'https://identity.example/discovery' },
      { authorizationUrl: 'https://identity.example/authorize' }, { scopes: ['write'] },
      { audience: 'other' }, { resource: 'other' }, { flow: 'external' as const },
    ]) expect((await manager.credentials({ ...binding, ...change })).key).not.toBe(baseline.key);
    const one = await manager.credentials({ ...binding, scopes: ['read', 'write'] });
    const two = await manager.credentials({ ...binding, scopes: ['write', 'read', 'read'] });
    expect(one.key).toBe(two.key);
    for (const configuration of [
      { clientIdentity: 'another-client', grantIdentity: 'session' },
      { clientIdentity: 'client', grantIdentity: 'another-session' },
      { clientIdentity: 'client', grantIdentity: 'session', endpoints: { tokenUrl: 'https://override.example/token' } },
    ]) {
      provider.configuration = configuration;
      expect((await manager.credentials(binding)).key).not.toBe(baseline.key);
    }
    expect(provider.acquired.at(-1)?.profile).toBe('external');
    provider.identity = 'new-provider';
    expect((await manager.credentials(binding)).key).not.toBe(baseline.key);
  });

  it('coalesces acquisition and leaves a shared renewal running when one waiter cancels', async () => {
    const started = deferred<AbortSignal>();
    const result = deferred<TokenSet>();
    let count = 0;
    const provider: TokenProvider = {
      identity: 'provider', configure: () => ({ clientIdentity: 'client' }),
      acquire: async (_request, signal) => { count++; started.resolve(signal); return result.promise; },
    };
    const manager = new TokenManager({ identity: provider }, { now: () => 1_000 });
    const controller = new AbortController();
    const canceled = manager.credentials(binding, controller.signal);
    const other = manager.credentials(binding);
    const signal = await started.promise;
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(false);
    result.resolve({ accessToken: 'shared' });
    expect((await other).tokens.accessToken).toBe('shared');
    expect(count).toBe(1);
  });

  it('cancels a provider when the last waiter leaves and allows a later invocation', async () => {
    const started = deferred<AbortSignal>();
    let count = 0;
    const provider: TokenProvider = {
      identity: 'provider', configure: () => ({ clientIdentity: 'client' }),
      acquire: async (_request, signal) => {
        count++;
        if (count > 1) return { accessToken: 'next' };
        started.resolve(signal);
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      },
    };
    const manager = new TokenManager({ identity: provider });
    const controller = new AbortController();
    const canceled = manager.credentials(binding, controller.signal);
    const signal = await started.promise;
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(true);
    expect((await manager.credentials(binding)).tokens.accessToken).toBe('next');
    expect(count).toBe(2);
  });

  it('does not invoke providers for an already canceled request', async () => {
    const provider = new Provider();
    const manager = new TokenManager({ identity: provider });
    const controller = new AbortController(); controller.abort();
    await expect(manager.credentials(binding, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(provider.acquired).toEqual([]);
  });

  it('does not cache provider failures or expose their credential-bearing messages', async () => {
    let count = 0;
    const provider: TokenProvider = {
      identity: 'provider', configure: () => ({ clientIdentity: 'client' }),
      acquire: async () => { if (++count === 1) throw new Error('secret-token'); return { accessToken: 'safe' }; },
    };
    const manager = new TokenManager({ identity: provider });
    await expect(manager.credentials(binding)).rejects.toEqual(new TokenProviderError());
    expect((await manager.credentials(binding)).tokens.accessToken).toBe('safe');
    expect(count).toBe(2);
  });

  it('uses application token storage across manager instances and snapshots provider results', async () => {
    const values = new Map<string, TokenSet>();
    const store: TokenStore = {
      load: async key => values.get(key), save: async (key, value) => { values.set(key, value); },
      remove: async key => { values.delete(key); },
    };
    const provider = new Provider();
    const options = { store, now: () => 1_000, expirySkewMs: 0 };
    const first = await new TokenManager({ identity: provider }, options).credentials(binding);
    provider.next = { accessToken: 'changed', expiresAt: 3_000 };
    const second = await new TokenManager({ identity: provider }, options).credentials(binding);
    expect(second.tokens).toEqual(first.tokens);
    expect(provider.acquired).toHaveLength(1);
    expect(Object.isFrozen(first.tokens)).toBe(true);
  });
});


it('only reacquires client credentials for rejected refresh grants', async () => {
  for (const reason of ['unavailable', 'temporary', 'invalidGrant'] as const) {
    const provider = new Provider();
    provider.refresh = async () => { throw new TokenProviderError(reason); };
    const manager = new TokenManager({ identity: provider }, { now: () => 0 });
    await manager.invalidate(await manager.credentials(binding));
    provider.next = { accessToken: 'replacement' };
    if (reason === 'invalidGrant') {
      expect((await manager.credentials(binding)).tokens.accessToken).toBe('replacement');
      expect(provider.acquired).toHaveLength(2);
    }
    else {
      await expect(manager.credentials(binding)).rejects.toMatchObject({ reason });
      expect(provider.acquired).toHaveLength(1);
    }
  }
});

it('does not persist late acquisition from a provider ignoring cancellation', async () => {
  const started = deferred<void>();
  const finish = deferred<TokenSet>();
  const provider = new Provider();
  provider.acquire = async request => {
    provider.acquired.push(request);
    if (provider.acquired.length === 1) { started.resolve(); return finish.promise; }
    return { accessToken: 'fresh' };
  };
  const manager = new TokenManager({ identity: provider });
  const controller = new AbortController();
  const caller = manager.credentials(binding, controller.signal);
  await started.promise;
  controller.abort();
  await expect(caller).rejects.toMatchObject({ name: 'AbortError' });
  finish.resolve({ accessToken: 'late' });
  expect((await manager.credentials(binding)).tokens.accessToken).toBe('fresh');
  expect(provider.acquired).toHaveLength(2);
});

it('rejects a canceled late refresh before persistence and requires fresh interactive authorization', async () => {
  const started = deferred<void>();
  const finish = deferred<TokenSet>();
  const provider = new Provider();
  provider.refresh = async (_request, token) => {
    provider.refreshed.push(token);
    if (provider.refreshed.length === 1) { started.resolve(); return finish.promise; }
    throw new AuthorizationRequiredError();
  };
  const manager = new TokenManager({ identity: provider }, { now: () => 0 });
  const interactive = { ...binding, flow: 'authorizationCode' as const };
  await manager.invalidate(await manager.credentials(interactive));
  const controller = new AbortController();
  const caller = manager.credentials(interactive, controller.signal);
  await started.promise;
  controller.abort();
  await expect(caller).rejects.toMatchObject({ name: 'AbortError' });
  finish.resolve({ accessToken: 'late', refreshToken: 'rotated' });
  await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(AuthorizationRequiredError);
  expect(provider.refreshed).toEqual(['refresh-first', 'refresh-first']);
  expect(provider.acquired).toHaveLength(1);
});

it('preserves refresh rotation when the last waiter cancels after persistence starts', async () => {
  const saving = deferred<void>();
  const finish = deferred<void>();
  const values = new Map<string, TokenSet>();
  const store: TokenStore = {
    load: async key => values.get(key),
    save: async (key, tokens) => {
      if (tokens.accessToken === 'rotated') { saving.resolve(); await finish.promise; }
      values.set(key, tokens);
    },
    remove: async key => { values.delete(key); },
  };
  const provider = new Provider();
  const manager = new TokenManager({ identity: provider }, { store, now: () => 0 });
  await manager.invalidate(await manager.credentials(binding));
  provider.next = { accessToken: 'rotated', refreshToken: 'refresh-next' };
  const controller = new AbortController();
  const caller = manager.credentials(binding, controller.signal);
  await saving.promise;
  controller.abort();
  await expect(caller).rejects.toMatchObject({ name: 'AbortError' });
  finish.resolve();
  const lease = await manager.credentials(binding);
  expect(lease.tokens).toEqual(provider.next);
  expect(values.get(lease.key)).toEqual(provider.next);
  expect(provider.refreshed).toEqual(['refresh-first']);
});
