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

import { beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import fetchMock from 'fetch-mock';
import {
  AuthorizationRequiredError, FetchOAuthTokenProvider, SecurityBinding, TokenManager, TokenProviderError,
} from '../src';

const binding: SecurityBinding = {
  scheme: 'identity', provider: 'identity', profile: 'external', flow: 'clientCredentials',
  tokenUrl: 'https://identity.example/token', scopes: ['read', 'write'], audience: 'api', resource: 'urn:api',
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

describe('OAuth exchange', () => {
  beforeEach(() => { fetchMock.hardReset().mockGlobal(); });

  for (const authentication of ['client_secret_basic', 'client_secret_post'] as const) {
    it(`acquires and rotates credentials using ${authentication}`, async () => {
      let exchanges = 0;
      fetchMock.post('https://identity.example/token', call => {
        const form = new URLSearchParams(call.options.body as string);
        exchanges++;
        expect(form.get('scope')).toBe('read write');
        expect(form.get('audience')).toBe('api');
        expect(form.get('resource')).toBe('urn:api');
        expect(call.options.credentials).toBe('omit');
        expect(call.options.redirect).toBe('manual');
        const authorization = new Headers(call.options.headers).get('Authorization');
        if (authentication === 'client_secret_basic') {
          expect(authorization).toBe(`Basic ${btoa('client%3Aname:s+e%3Ac')}`);
          expect(form.has('client_secret')).toBe(false);
        }
        else {
          expect(authorization).toBeNull();
          expect(form.get('client_id')).toBe('client:name');
          expect(form.get('client_secret')).toBe('s e:c');
        }
        expect(form.get('grant_type')).toBe(exchanges === 1 ? 'client_credentials' : 'refresh_token');
        if (exchanges > 1) expect(form.get('refresh_token')).toBe(`refresh-${exchanges - 1}`);
        return { token_type: 'Bearer', access_token: `token-${exchanges}`, refresh_token: `refresh-${exchanges}`, expires_in: 60 };
      });
      const provider = new FetchOAuthTokenProvider({
        identity: 'app', clientId: 'client:name', clientSecret: 's e:c', authentication, now: () => 0,
      });
      const manager = new TokenManager({ identity: provider }, { now: () => 0 });
      for (let index = 0; index < 3; index++) {
        const lease = await manager.credentials(binding);
        expect(lease.tokens.expiresAt).toBe(60_000);
        await manager.invalidate(lease);
      }
      expect(exchanges).toBe(3);
    });
  }

  it('consumes a PKCE grant once and requires fresh authorization after invalid refresh', async () => {
    let exchanges = 0;
    fetchMock.post('https://identity.example/token', call => {
      const form = new URLSearchParams(call.options.body as string);
      exchanges++;
      expect(form.get('client_id')).toBe('public-client');
      expect(new Headers(call.options.headers).has('Authorization')).toBe(false);
      if (form.get('grant_type') === 'authorization_code') {
        expect(form.get('code')).toBe('fresh-code');
        expect(form.get('code_verifier')).toBe('v'.repeat(43));
        expect(form.get('redirect_uri')).toBe('https://app.example/callback');
        return { token_type: 'Bearer', access_token: 'first', refresh_token: 'rotating' };
      }
      expect(form.has('code')).toBe(false);
      return { status: 400, body: { error: 'invalid_grant', error_description: 'SECRET' } };
    });
    const provider = new FetchOAuthTokenProvider({
      identity: 'app', clientId: 'public-client', grantIdentity: 'fresh-session',
      authorization: async () => ({ code: 'fresh-code', redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) }),
    });
    const manager = new TokenManager({ identity: provider });
    const interactive = { ...binding, flow: 'authorizationCode' as const };
    await manager.invalidate(await manager.credentials(interactive));
    await expect(manager.credentials(interactive)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    await expect(manager.credentials({ ...interactive, scopes: ['read'] })).rejects.toBeInstanceOf(AuthorizationRequiredError);
    expect(exchanges).toBe(2);
  });

  for (const methods of [
    ['private_key_jwt', 'client_secret_basic', 'client_secret_post', 'tls_client_auth', 'client_secret_jwt'],
    undefined, ['none'], [],
  ]) {
    it(`acquires and rotates public PKCE credentials with discovery methods ${JSON.stringify(methods)}`, async () => {
      let discoveries = 0;
      let authorizations = 0;
      let now = 0;
      const forms: URLSearchParams[] = [];
      fetchMock.get('https://identity.example/discovery', call => {
        discoveries++;
        expect(call.options.credentials).toBe('omit');
        expect(call.options.redirect).toBe('manual');
        return {
          issuer: 'https://identity.example', token_endpoint: `https://identity.example/token-${discoveries}`,
          authorization_endpoint: 'https://identity.example/authorize', token_endpoint_auth_methods_supported: methods,
        };
      });
      for (const index of [1, 2, 3]) {
        fetchMock.post(`https://identity.example/token-${index}`, call => {
          forms.push(new URLSearchParams(call.options.body as string));
          expect(new Headers(call.options.headers).has('Authorization')).toBe(false);
          expect(call.options.credentials).toBe('omit');
          expect(call.options.redirect).toBe('manual');
          return { access_token: `token-${index}`, refresh_token: `refresh-${index}`, token_type: 'bearer', expires_in: 60 };
        });
      }
      const provider = new FetchOAuthTokenProvider({
        identity: 'app', clientId: 'public', authentication: 'none', grantIdentity: 'session',
        issuer: 'https://identity.example', now: () => now,
        authorization: async request => {
          authorizations++;
          expect(request.authorizationUrl).toBe('https://identity.example/authorize');
          return { code: 'fresh-code', redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) };
        },
      });
      const manager = new TokenManager({ identity: provider }, { now: () => now });
      const discovered = { ...binding, flow: 'authorizationCode' as const, tokenUrl: undefined, discoveryUrl: 'https://identity.example/discovery' };
      for (const index of [1, 2, 3]) {
        const lease = await manager.credentials(discovered);
        expect(lease.tokens.accessToken).toBe(`token-${index}`);
        expect(lease.tokens.refreshToken).toBe(`refresh-${index}`);
        now += 90_000;
      }
      expect(discoveries).toBe(3);
      expect(authorizations).toBe(1);
      expect(forms).toHaveLength(3);
      forms.forEach((form, index) => {
        expect(form.get('client_id')).toBe('public');
        expect(form.has('client_secret')).toBe(false);
        expect(form.get('grant_type')).toBe(index === 0 ? 'authorization_code' : 'refresh_token');
        if (index === 0) {
          expect(form.get('code')).toBe('fresh-code');
          expect(form.get('code_verifier')).toBe('v'.repeat(43));
          expect(form.get('redirect_uri')).toBe('https://app.example/callback');
        }
        else {
          expect(form.get('refresh_token')).toBe(`refresh-${index}`);
          expect(form.has('code')).toBe(false);
          expect(form.has('code_verifier')).toBe(false);
        }
      });
    });
  }

  for (const authentication of ['none', 'client_secret_basic', 'client_secret_post'] as const) {
    const unsupported = authentication === 'none' ? [] : [[], ['none'], [authentication === 'client_secret_basic' ? 'client_secret_post' : 'client_secret_basic']];
    const malformed = [null, 'none', {}, 42, [authentication, 42], [authentication, null]];
    for (const methods of [...malformed, ...unsupported, ...(authentication === 'client_secret_post' ? [undefined] : [])]) {
      it(`rejects invalid discovery methods ${JSON.stringify(methods)} for ${authentication} before authorization`, async () => {
        let authorizations = 0;
        fetchMock.get('https://identity.example/discovery', {
          issuer: 'https://identity.example', token_endpoint: 'https://identity.example/token',
          token_endpoint_auth_methods_supported: methods,
        });
        const provider = new FetchOAuthTokenProvider({
          identity: 'app', clientId: 'client', authentication,
          clientSecret: authentication === 'none' ? undefined : 'SECRET', issuer: 'https://identity.example',
          authorization: async () => {
            authorizations++;
            return { code: 'SECRET', redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) };
          },
        });
        const request = { ...binding, flow: 'authorizationCode' as const, clientIdentity: 'client', discoveryUrl: 'https://identity.example/discovery' };
        const signal = new AbortController().signal;
        await expect(provider.acquire(request, signal)).rejects.toThrow('could not supply usable credentials');
        await expect(provider.refresh(request, 'SECRET', signal)).rejects.toThrow('could not supply usable credentials');
        expect(authorizations).toBe(0);
        expect(fetchMock.callHistory.calls()).toHaveLength(2);
      });
    }
  }

  for (const metadata of [
    { issuer: 'https://untrusted.example' },
    { token_endpoint: 'http://remote.example/token' },
    { token_endpoint: 'https://user:SECRET@identity.example/token' },
    { authorization_endpoint: 'https://identity.example/authorize#fragment' },
    { authorization_endpoint: 'file:///authorize' },
  ]) {
    it(`rejects untrusted public discovery before authorization: ${JSON.stringify(metadata)}`, async () => {
      let authorizations = 0;
      fetchMock.get('https://identity.example/discovery', {
        issuer: 'https://identity.example', token_endpoint: 'https://identity.example/token',
        authorization_endpoint: 'https://identity.example/authorize', ...metadata,
      });
      const provider = new FetchOAuthTokenProvider({
        identity: 'app', clientId: 'public', issuer: 'https://identity.example',
        authorization: async () => {
          authorizations++;
          return { code: 'SECRET', redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) };
        },
      });
      const request = { ...binding, tokenUrl: undefined, flow: 'authorizationCode' as const, clientIdentity: 'public', discoveryUrl: 'https://identity.example/discovery' };
      const signal = new AbortController().signal;
      await expect(provider.acquire(request, signal)).rejects.toBeInstanceOf(TokenProviderError);
      await expect(provider.refresh(request, 'SECRET', signal)).rejects.toBeInstanceOf(TokenProviderError);
      expect(authorizations).toBe(0);
      expect(fetchMock.callHistory.calls()).toHaveLength(2);
    });
  }

  it('revalidates public discovery issuer on refresh even with endpoint overrides', async () => {
    let discoveries = 0;
    let authorizations = 0;
    fetchMock.get('https://identity.example/discovery', () => ({
      issuer: ++discoveries === 1 ? 'https://identity.example' : 'https://untrusted.example',
      authorization_endpoint: 'https://identity.example/authorize',
      token_endpoint: 'https://identity.example/token',
    }));
    fetchMock.post('https://deployment.example/token', { access_token: 'token', refresh_token: 'refresh', token_type: 'bearer' });
    const provider = new FetchOAuthTokenProvider({
      identity: 'app', clientId: 'public', grantIdentity: 'session', issuer: 'https://identity.example',
      endpoints: { tokenUrl: 'https://deployment.example/token' },
      authorization: async () => {
        authorizations++;
        return { code: 'fresh-code', redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) };
      },
    });
    const manager = new TokenManager({ identity: provider });
    const discovered = { ...binding, flow: 'authorizationCode' as const, discoveryUrl: 'https://identity.example/discovery' };
    await manager.invalidate(await manager.credentials(discovered));
    await expect(manager.credentials(discovered)).rejects.toBeInstanceOf(TokenProviderError);
    await expect(manager.credentials({ ...discovered, scopes: ['read'] })).rejects.toBeInstanceOf(TokenProviderError);
    expect(authorizations).toBe(1);
    expect(discoveries).toBe(3);
    expect(fetchMock.callHistory.calls('https://deployment.example/token')).toHaveLength(1);
  });

  it('checks discovery issuer while applying acquisition endpoint overrides', async () => {
    fetchMock.get('https://metadata.example/document', { issuer: 'https://trusted.example', token_endpoint: 'https://trusted.example/token' });
    fetchMock.post('https://deployment.example/token', { token_type: 'bearer', access_token: 'token' });
    const provider = new FetchOAuthTokenProvider({
      identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_basic',
      issuer: 'https://trusted.example', endpoints: { tokenUrl: 'https://deployment.example/token' },
    });
    const manager = new TokenManager({ identity: provider });
    const discovered = { ...binding, tokenUrl: undefined, discoveryUrl: 'https://metadata.example/document' };
    await manager.credentials(discovered);
    await manager.credentials({ ...discovered, scopes: ['read'] });
    expect(fetchMock.callHistory.calls('https://metadata.example/document')).toHaveLength(2);
    expect(fetchMock.callHistory.calls('https://deployment.example/token')).toHaveLength(2);
    const wrong = new FetchOAuthTokenProvider({
      identity: 'wrong', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_basic', issuer: 'https://other.example',
    });
    await expect(new TokenManager({ identity: wrong }).credentials(discovered)).rejects.toBeInstanceOf(TokenProviderError);
    expect(fetchMock.callHistory.calls('https://deployment.example/token')).toHaveLength(2);
  });

  it('rejects redirects and invalid responses without exposing provider details', async () => {
    for (const response of [
      { status: 302, headers: { Location: 'https://other.example' } },
      { access_token: 'secret', token_type: 'unsupported' },
      { access_token: 'secret', token_type: 'bearer', expires_in: -1 },
      { access_token: 'secret', token_type: 'bearer', scope: 'read' },
      { status: 400, body: { error: 'invalid_client', error_description: 'SECRET' } },
    ]) {
      fetchMock.hardReset().mockGlobal();
      fetchMock.post('https://identity.example/token', response);
      const provider = new FetchOAuthTokenProvider({
        identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_post',
      });
      await expect(new TokenManager({ identity: provider }).credentials(binding)).rejects.toThrow('could not supply usable credentials');
      expect(fetchMock.callHistory.calls()).toHaveLength(1);
    }
  });

  it('rejects public client credentials and unsafe endpoints before network access', async () => {
    const publicProvider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'public' });
    await expect(new TokenManager({ identity: publicProvider }).credentials(binding)).rejects.toBeInstanceOf(TokenProviderError);
    const provider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_post' });
    for (const tokenUrl of ['http://remote.example/token', 'https://user:secret@example.test/token', 'file:///token']) {
      await expect(new TokenManager({ identity: provider }).credentials({ ...binding, tokenUrl })).rejects.toBeInstanceOf(TokenProviderError);
    }
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });
  it('refreshes discovery when endpoints and supported authentication change', async () => {
    let discoveries = 0;
    fetchMock.get('https://identity.example/discovery', () => ({
      issuer: 'https://identity.example', token_endpoint: `https://identity.example/token-${++discoveries}`,
      token_endpoint_auth_methods_supported: discoveries < 3 ? ['client_secret_basic'] : ['none'],
    }));
    for (const index of [1, 2]) fetchMock.post(`https://identity.example/token-${index}`, { access_token: `token-${index}`, token_type: 'bearer' });
    const provider = new FetchOAuthTokenProvider({
      identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_basic', issuer: 'https://identity.example',
    });
    const manager = new TokenManager({ identity: provider });
    const discovered = { ...binding, tokenUrl: undefined, discoveryUrl: 'https://identity.example/discovery' };
    const first = await manager.credentials(discovered);
    expect(first.tokens.accessToken).toBe('token-1');
    await manager.invalidate(first);
    const second = await manager.credentials(discovered);
    expect(second.tokens.accessToken).toBe('token-2');
    await manager.invalidate(second);
    await expect(manager.credentials(discovered)).rejects.toBeInstanceOf(TokenProviderError);
    expect(discoveries).toBe(3);
    expect(fetchMock.callHistory.calls()).toHaveLength(5);
  });

  it('bounds consumed grants without making old authorization codes reusable', async () => {
    let grants = 0;
    fetchMock.post('https://identity.example/token', { access_token: 'token', token_type: 'bearer' });
    const provider = new FetchOAuthTokenProvider({
      identity: 'app', clientId: 'public', grantIdentity: 'session',
      authorization: () => Promise.resolve({ code: `code-${++grants}`, redirectUri: 'https://app.example/callback', codeVerifier: 'v'.repeat(43) }),
    });
    const request = { ...binding, flow: 'authorizationCode' as const, clientIdentity: 'public' };
    for (let index = 0; index < 1024; index++) await provider.acquire(request, new AbortController().signal);
    await expect(provider.acquire(request, new AbortController().signal)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    expect(grants).toBe(1024);
    expect(fetchMock.callHistory.calls()).toHaveLength(1024);
  });

  it('classifies temporary outages and invalid grants without leaking response details', async () => {
    for (const [status, body, reason] of [
      [503, 'SECRET outage', 'temporary'], [429, 'SECRET rate limit', 'temporary'],
      [400, { error: 'temporarily_unavailable' }, 'temporary'],
      [400, { error: 'invalid_grant' }, 'invalidGrant'],
      [400, { error: 'invalid_client' }, 'unavailable'],
    ] as const) {
      fetchMock.hardReset().mockGlobal();
      fetchMock.post('https://identity.example/token', { status, body });
      const provider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_post' });
      await expect(new TokenManager({ identity: provider }).credentials(binding)).rejects.toMatchObject({ reason });
    }
  });

  it('runs shared HTTP fixtures through acquire and refresh', async () => {
    const corpus = JSON.parse(readFileSync(new URL('../test-fixtures/oauth/http-cases.json', import.meta.url), 'utf8')) as {
      formatVersion: number; cases: { id: string; target: string; status: number; body: string; headers: Record<string, string>; expected: string }[];
    };
    expect(corpus.formatVersion).toBe(1);
    for (const fixture of corpus.cases) {
      for (const refresh of [false, true]) {
        fetchMock.hardReset().mockGlobal();
        const discovery = fixture.target === 'discovery';
        fetchMock.route(`https://identity.example/${discovery ? 'discovery' : 'token'}`,
          { status: fixture.status, body: fixture.status === 204 ? undefined : fixture.body, headers: fixture.headers },
          { method: discovery ? 'GET' : 'POST' });
        const provider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'client', clientSecret: 'secret',
          authentication: 'client_secret_post', issuer: 'https://trusted.example' });
        const request = { ...binding, discoveryUrl: discovery ? 'https://identity.example/discovery' : undefined,
          clientIdentity: 'client' };
        const signal = new AbortController().signal;
        const operation = refresh ? provider.refresh(request, 'refresh-secret', signal) : provider.acquire(request, signal);
        await expect(operation).rejects.toMatchObject({ reason: fixture.expected === 'invalid_grant' ? 'invalidGrant' : fixture.expected });
        expect(fetchMock.callHistory.calls().length).toBe(1);
      }
    }
  });

});
