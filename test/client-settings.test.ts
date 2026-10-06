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
import { ClientSettings, FetchTransport, SecurityBinding } from '../src';

const bearer: SecurityBinding = {
  scheme: 'identity', provider: 'identity', flow: 'static', scopes: [],
  transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
};

describe('client settings', () => {
  it('constructs the application-selected transport without OAuth acquisition', () => {
    const settings = new ClientSettings('https://api.example/v1', { list: [bearer] }, {
      identity: { kind: 'bearer', token: 'private-token' },
    });
    const transport = FetchTransport.fromSettings(settings);
    expect(transport.baseUrl.complete('', {}).href).toBe('https://api.example/v1');
    expect(transport.tokenManager).toBeDefined();
    expect(JSON.stringify(settings)).not.toContain('private-token');
  });

  it('retains operation scopes and snapshots caller-owned bindings', async () => {
    const bindings = { list: [{ ...bearer, scopes: ['read'] }] };
    const credentials = { identity: { kind: 'bearer' as const, token: 'original' } };
    const settings = new ClientSettings('https://api.example', bindings, credentials);
    credentials.identity.token = 'changed';
    bindings.list[0].scopes.push('write');
    const manager = settings.tokenManager!;
    expect(settings.bindings.list[0].scopes).toEqual(['read']);
    expect((await manager.credentials(settings.bindings.list[0])).tokens.accessToken).toBe('original');
  });

  it('rejects missing or incompatible credentials before transport construction', () => {
    expect(() => new ClientSettings('https://api.example', { list: [bearer] })).toThrow('Missing credentials');
    expect(() => new ClientSettings('https://api.example', { list: [bearer] }, {
      identity: { kind: 'apiKey', key: 'private-key' },
    })).toThrow('API key credentials do not match');
  });

  it('encodes Basic credentials and preserves API-key placement metadata', async () => {
    const basic = { ...bearer, transport: { ...bearer.transport, prefix: 'Basic' } };
    const settings = new ClientSettings('https://api.example', { list: [basic] }, {
      identity: { kind: 'basic', username: 'user', password: 'secret' },
    });
    const manager = settings.tokenManager!;
    expect((await manager.credentials(basic)).tokens.accessToken).toBe(btoa('user:secret'));
    const key = { ...bearer, scheme: 'key', provider: 'key', transport: { location: 'query' as const, name: 'api_key' } };
    const keySettings = new ClientSettings('https://api.example', { list: [key] }, { key: { kind: 'apiKey', key: 'secret' } });
    expect(keySettings.bindings.list[0].transport).toEqual(key.transport);
  });

  it('constructs an OAuth provider once for repeated scheme bindings without acquiring', () => {
    const oauth = { ...bearer, flow: 'clientCredentials' as const };
    let calls = 0;
    const settings = new ClientSettings('https://api.example', { list: [oauth], read: [{ ...oauth, scopes: ['read'] }] }, {
      identity: { kind: 'oauth', flow: 'clientCredentials', identity: 'application', clientId: 'client',
        clientSecret: 'secret', authentication: 'client_secret_basic', providerFactory: credentials => {
          calls++;
          return { identity: credentials.identity, configure: () => ({ clientIdentity: 'client' }),
            acquire: async () => { throw new Error('Unexpected acquisition'); } };
        } },
    });
    expect(settings.tokenManager).toBeDefined();
    expect(calls).toBe(1);
  });
  it('selects complete conjunctions, public overrides, and explicit alternatives', () => {
    const key: SecurityBinding = { ...bearer, scheme: 'key', provider: 'key', transport: { location: 'query', name: 'key' } };
    const alternatives = { list: [[bearer, key], [bearer]], public: [[]] };
    const credentials = { identity: { kind: 'bearer' as const, token: 'one' }, key: { kind: 'apiKey' as const, key: 'two' } };
    expect(() => ClientSettings.resolve('https://api.example', alternatives, credentials)).toThrow('one complete');
    const settings = ClientSettings.resolve('https://api.example', alternatives, credentials, { list: ['identity', 'key'] });
    expect(settings.bindings.list.map(binding => binding.scheme)).toEqual(['identity', 'key']);
    expect(settings.bindings.public).toEqual([]);
    expect(() => ClientSettings.resolve('https://api.example', { list: [[bearer, key]] }, { identity: credentials.identity })).toThrow();
  });

  it('resolves document and security URLs without substituting security templates', () => {
    const endpoint = ClientSettings.serverUrl('../{version}', { version: 'v2' }, 'https://api.example/spec/openapi.yaml');
    expect(endpoint).toBe('https://api.example/v2');
    const binding = { ...bearer, tokenUrl: 'oauth/token' };
    const settings = new ClientSettings(endpoint, { list: [binding] }, { identity: { kind: 'bearer', token: 'secret' } });
    expect(settings.bindings.list[0].tokenUrl).toBe('https://api.example/oauth/token');
    expect(() => ClientSettings.serverUrl('/v2', {})).toThrow();
    expect(() => new ClientSettings(endpoint, { list: [{ ...binding, tokenUrl: '/{version}/token' }] }, { identity: { kind: 'bearer', token: 'secret' } })).toThrow();
  });

  it('isolates token managers between configurations with the same scheme', async () => {
    const first = new ClientSettings('https://one.example', { list: [bearer] }, { identity: { kind: 'bearer', token: 'one' } });
    const second = new ClientSettings('https://two.example', { list: [bearer] }, { identity: { kind: 'bearer', token: 'two' } });
    expect((await first.tokenManager!.credentials(bearer)).tokens.accessToken).toBe('one');
    expect((await second.tokenManager!.credentials(bearer)).tokens.accessToken).toBe('two');
  });

});
