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

import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Subprocess } from 'bun';

const KEYCLOAK_URL = 'https://github.com/keycloak/keycloak/releases/download/26.2.5/keycloak-26.2.5.tar.gz';
const KEYCLOAK_SHA = 'e99e5f8783ea8f1cc04140b7033ea7291ff9898a088f37399b88651d81238f88';
const KEYCLOAK_IMAGE = 'quay.io/keycloak/keycloak@sha256:4883630ef9db14031cde3e60700c9a9a8eaf1b5c24db1589d6a2d43de38ba2a9';
const WIREMOCK_URL = 'https://repo.maven.apache.org/maven2/org/wiremock/wiremock-standalone/3.13.1/wiremock-standalone-3.13.1.jar';
const WIREMOCK_SHA = 'bdf4c705e7fd61c778e59a19f75396eac4520efeabfac97643a53979bd4d5716';

export function backend(mode: string, system: string, ci: string | undefined): string {
  if (mode !== 'replay' && mode !== 'live') throw new Error('SUNDAY_OAUTH_TEST_MODE must be replay or live');
  if (mode === 'replay') return 'wiremock-java';
  const enabled = ci !== undefined && !['', '0', 'false'].includes(ci.toLowerCase());
  return system === 'darwin' && enabled ? 'keycloak-java' : 'keycloak-container';
}

export async function artifact(cache: string, url: string, checksum: string): Promise<string> {
  await mkdir(cache, { recursive: true });
  const target = join(cache, url.slice(url.lastIndexOf('/') + 1));
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  if (existsSync(target)) {
    if (digest(await readFile(target)) !== checksum) throw new Error('OAuth artifact cache integrity failure');
    return target;
  }
  const temporary = join(cache, randomUUID() + '.download');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error('OAuth artifact download failed');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (digest(bytes) !== checksum) throw new Error('OAuth artifact download integrity failure');
    await writeFile(temporary, bytes);
    await rename(temporary, target);
    return target;
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Suite-owned provider; backend selection never discovers Docker on macOS CI. */
export class Provider {
  readonly backend: string;
  readonly realm = 'sunday-' + randomUUID();
  readonly callback = 'http://127.0.0.1:49173/callback';
  base = '';
  issuer = '';
  directory = '';
  private process?: Subprocess;
  protected container?: string;

  constructor(readonly mode: string, readonly cache: string, private readonly startupTimeout = 120000,
    system = process.platform, ci = process.env.CI) {
    this.backend = backend(mode, system, ci);
  }

  async start(): Promise<this> {
    this.directory = await mkdtemp(join(tmpdir(), 'sunday-oauth-'));
    try {
      const reservation = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
      const port = reservation.port;
      reservation.stop(true);
      this.base = `http://127.0.0.1:${port}`;
      this.issuer = `${this.base}/realms/${this.realm}`;
      const command = await this.command(port);
      this.process = Bun.spawn(command, { stdout: Bun.file(join(this.directory, 'provider.log')), stderr: Bun.file(join(this.directory, 'provider-error.log')) });
      const url = this.mode === 'replay' ? `${this.base}/__admin/mappings` : `${this.issuer}/.well-known/openid-configuration`;
      const deadline = Date.now() + this.startupTimeout;
      while (Date.now() < deadline) {
        if (this.process.exitCode !== null || this.process.signalCode !== null) throw new Error('Provider exited before readiness');
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
          if (response.status === 200) return this;
        } catch { /* Startup connections can be refused until the provider is ready. */ }
        await Bun.sleep(100);
      }
      throw new Error('Provider readiness timeout');
    } catch {
      let cleanup = '';
      try { await this.close(); } catch { cleanup = '; container cleanup failed; retry close'; }
      throw new Error(`OAuth infrastructure startup failed (${this.backend})${cleanup}`);
    }
  }

  protected async command(port: number): Promise<string[]> {
    if (this.backend === 'wiremock-java') {
      return ['java', '-jar', await artifact(this.cache, WIREMOCK_URL, WIREMOCK_SHA), '--bind-address', '127.0.0.1', '--port', String(port)];
    }
    const imports = join(this.directory, 'import');
    await mkdir(imports);
    const realm = {
      realm: this.realm, enabled: true, sslRequired: 'none', revokeRefreshToken: true, refreshTokenMaxReuse: 0,
      clients: ['public', 'basic', 'post'].map(clientId => ({
        clientId, enabled: true, publicClient: clientId === 'public', secret: 'synthetic-secret',
        clientAuthenticatorType: 'client-secret', standardFlowEnabled: true, serviceAccountsEnabled: clientId !== 'public',
        redirectUris: [this.callback], protocol: 'openid-connect', attributes: { 'pkce.code.challenge.method': 'S256' },
      })),
      users: [{ username: 'synthetic-user', enabled: true, email: 'synthetic@example.invalid', emailVerified: true,
        firstName: 'Synthetic', lastName: 'User', credentials: [{ type: 'password', value: 'synthetic-password', temporary: false }] }],
    };
    const file = `${this.realm}-realm.json`;
    await writeFile(join(imports, file), JSON.stringify(realm));
    const options = ['start-dev', '--import-realm', '--http-port', String(port), '--hostname', this.base];
    if (this.backend === 'keycloak-java') {
      const archive = await artifact(this.cache, KEYCLOAK_URL, KEYCLOAK_SHA);
      const extract = Bun.spawn(['tar', '-xzf', archive, '-C', this.directory], { stdout: 'ignore', stderr: 'ignore' });
      await bounded(extract, 60000);
      const distribution = join(this.directory, 'keycloak-26.2.5');
      await mkdir(join(distribution, 'data/import'), { recursive: true });
      await writeFile(join(distribution, 'data/import', file), JSON.stringify(realm));
      return [join(distribution, 'bin/kc.sh'), ...options, '--http-host', '127.0.0.1'];
    }
    this.container = 'sunday-oauth-' + randomUUID();
    return ['docker', 'run', '--rm', '--name', this.container, '-p', `127.0.0.1:${port}:${port}`, '-v', `${imports}:/opt/keycloak/data/import:ro`, KEYCLOAK_IMAGE, ...options];
  }

  async close(): Promise<void> {
    let cleanupFailed = false;
    try {
      if (this.container) {
        try {
          await this.removeContainer(this.container);
          this.container = undefined;
        } catch { cleanupFailed = true; }
      }
      if (this.process && this.process.exitCode === null && this.process.signalCode === null) {
        this.process.kill('SIGTERM');
        try { await bounded(this.process, 10000); } catch { /* bounded already kills a timed-out process. */ }
      }
    } finally {
      if (this.directory) await rm(this.directory, { recursive: true, force: true });
    }
    if (cleanupFailed) throw new Error(`OAuth infrastructure container cleanup failed (${this.backend}); retry close`);
  }

  protected async removeContainer(name: string): Promise<void> {
    await bounded(Bun.spawn(['docker', 'rm', '-f', name], { stdout: 'ignore', stderr: 'ignore' }), 20000);
  }
}

export async function bounded(process: Subprocess, timeout: number): Promise<void> {
  const timer = setTimeout(() => process.kill('SIGKILL'), timeout);
  try {
    if (await process.exited !== 0) throw new Error('OAuth infrastructure process failed');
  } finally { clearTimeout(timer); }
}
