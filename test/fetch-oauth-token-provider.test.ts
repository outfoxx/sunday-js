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
    expect(fetchMock.callHistory.calls('https://metadata.example/document').length).toBe(1);
    expect(fetchMock.callHistory.calls('https://deployment.example/token').length).toBe(2);
    const wrong = new FetchOAuthTokenProvider({
      identity: 'wrong', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_basic', issuer: 'https://other.example',
    });
    await expect(new TokenManager({ identity: wrong }).credentials(discovered)).rejects.toBeInstanceOf(TokenProviderError);
    expect(fetchMock.callHistory.calls('https://deployment.example/token').length).toBe(2);
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
      expect(fetchMock.callHistory.calls().length).toBe(1);
    }
  });

  it('rejects public client credentials and unsafe endpoints before network access', async () => {
    const publicProvider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'public' });
    await expect(new TokenManager({ identity: publicProvider }).credentials(binding)).rejects.toBeInstanceOf(TokenProviderError);
    const provider = new FetchOAuthTokenProvider({ identity: 'app', clientId: 'client', clientSecret: 'secret', authentication: 'client_secret_post' });
    for (const tokenUrl of ['http://remote.example/token', 'https://user:secret@example.test/token', 'file:///token']) {
      await expect(new TokenManager({ identity: provider }).credentials({ ...binding, tokenUrl })).rejects.toBeInstanceOf(TokenProviderError);
    }
    expect(fetchMock.callHistory.calls().length).toBe(0);
  });
});
