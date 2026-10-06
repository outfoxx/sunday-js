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

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import fetchMock from 'fetch-mock';
import { AuthorizationRequiredError, FetchOAuthTokenProvider, type AuthorizationGrant, type TokenRequest } from '../src';
import { Provider, bounded } from './oauth-support/provider';

const mode = process.env.SUNDAY_OAUTH_TEST_MODE ?? 'replay';
const provider = new Provider(mode, join(import.meta.dir, '../.oauth-cache'));
const verifier = 'v'.repeat(64);

async function authorization(clientId: string): Promise<AuthorizationGrant> {
  if (mode === 'replay') return { code: 'synthetic-code', redirectUri: provider.callback, codeVerifier: verifier };
  const state = randomUUID();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: provider.callback, response_type: 'code',
    scope: 'openid', state, code_challenge: challenge, code_challenge_method: 'S256' });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let accept!: (code: string) => void;
    let reject!: (error: Error) => void;
    const result = new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; });
    const timer = setTimeout(() => reject(new Error('OAuth browser callback timeout')), 30000);
    try {
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin + url.pathname !== provider.callback) return;
        const params = url.searchParams;
        if (params.get('state') !== state || !params.get('code')) reject(new Error('Invalid OAuth authorization response'));
        else accept(params.get('code')!);
      });
      await page.goto(`${provider.issuer}/protocol/openid-connect/auth?${query}`);
      await page.locator('#username').fill('synthetic-user');
      await page.locator('#password').fill('synthetic-password');
      await page.locator('#kc-login').click({ noWaitAfter: true });
      return { code: await result, redirectUri: provider.callback, codeVerifier: verifier };
    } finally { clearTimeout(timer); }
  } finally { await browser.close(); }
}

async function admin(path: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(provider.base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error('OAuth replay configuration failed');
}

async function replay(clientId: string, authentication: string): Promise<void> {
  await admin('/__admin/mappings', 'DELETE');
  await admin('/__admin/scenarios/reset', 'POST');
  const token = new URL(provider.issuer).pathname + '/protocol/openid-connect/token';
  await admin('/__admin/mappings', 'POST', { request: { method: 'GET', urlPath: new URL(provider.issuer).pathname + '/.well-known/openid-configuration' },
    response: { status: 200, jsonBody: { issuer: provider.issuer, token_endpoint: provider.base + token,
      authorization_endpoint: provider.issuer + '/protocol/openid-connect/auth', token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'] } } });
  for (const [index, grant] of ['authorization_code', 'refresh_token'].entries()) {
    const form: Record<string, unknown> = { grant_type: { equalTo: grant } };
    if (index === 0) Object.assign(form, { code: { equalTo: 'synthetic-code' }, code_verifier: { equalTo: verifier }, redirect_uri: { equalTo: provider.callback } });
    else form.refresh_token = { equalTo: 'synthetic-refresh-1' };
    const headers: Record<string, unknown> = {};
    if (authentication === 'client_secret_basic') headers.Authorization = { equalTo: 'Basic ' + btoa(`${clientId}:synthetic%2Dsecret`) };
    else {
      form.client_id = { equalTo: clientId };
      if (authentication === 'client_secret_post') form.client_secret = { equalTo: 'synthetic-secret' };
    }
    await admin('/__admin/mappings', 'POST', { scenarioName: 'rotation', requiredScenarioState: index === 0 ? 'Started' : 'acquired', newScenarioState: index === 0 ? 'acquired' : 'rotated',
      request: { method: 'POST', urlPath: token, formParameters: form, headers },
      response: { status: 200, jsonBody: { access_token: `synthetic-access-${index}`, token_type: 'Bearer', expires_in: 60, refresh_token: `synthetic-refresh-${index + 1}` } } });
  }
  await admin('/__admin/mappings', 'POST', { priority: 10, request: { method: 'POST', urlPath: token }, response: { status: 400, jsonBody: { error: 'invalid_grant' } } });
}

describe('Managed OAuth interoperability', () => {
  beforeAll(async () => {
    fetchMock.hardReset();
    if (mode === 'live' && !existsSync(chromium.executablePath())) {
      await bounded(Bun.spawn(['bun', 'node_modules/playwright/cli.js', 'install', 'chromium'], { stdout: 'ignore', stderr: 'ignore' }), 240000);
    }
    await provider.start();
  }, 300000);
  afterAll(async () => { await provider.close(); }, 30000);

  for (const authentication of ['none', 'client_secret_basic', 'client_secret_post'] as const) {
    it(`acquires and rotates with ${authentication}`, async () => {
      const clientId = { none: 'public', client_secret_basic: 'basic', client_secret_post: 'post' }[authentication];
      if (mode === 'replay') await replay(clientId, authentication);
      const client = new FetchOAuthTokenProvider({ identity: 'interop', clientId, authentication,
        clientSecret: authentication === 'none' ? undefined : 'synthetic-secret', issuer: provider.issuer,
        authorization: () => authorization(clientId) });
      const request: TokenRequest = { scheme: 'identity', provider: 'identity', profile: 'external', flow: 'authorizationCode',
        clientIdentity: clientId, discoveryUrl: provider.issuer + '/.well-known/openid-configuration', scopes: [],
        transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' } };
      const signal = new AbortController().signal;
      const acquired = await client.acquire(request, signal);
      expect(acquired.refreshToken).toBeTruthy();
      const rotated = await client.refresh(request, acquired.refreshToken!, signal);
      expect(rotated.refreshToken).toBeTruthy();
      expect(rotated.refreshToken).not.toBe(acquired.refreshToken);
      await expect(client.refresh(request, acquired.refreshToken!, signal)).rejects.toBeInstanceOf(AuthorizationRequiredError);
    }, 60000);
  }
});
