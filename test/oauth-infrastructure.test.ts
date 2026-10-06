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

import { describe, expect, test } from 'bun:test';
import fetchMock from 'fetch-mock';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifact, backend, bounded, Provider } from './oauth-support/provider';

describe('OAuth infrastructure', () => {
  test('CI values select a backend before any executable discovery', () => {
    for (const ci of [undefined, '', '0', 'false', 'FALSE']) {
      expect(backend('live', 'darwin', ci)).toBe('keycloak-container');
    }
    for (const ci of ['1', 'true', 'yes', 'github']) {
      expect(backend('live', 'darwin', ci)).toBe('keycloak-java');
      expect(backend('live', 'linux', ci)).toBe('keycloak-container');
      expect(backend('replay', 'darwin', ci)).toBe('wiremock-java');
    }
    expect(() => backend('automatic', 'darwin', 'true')).toThrow('replay or live');
  });

  test('cached artifacts are verified before use', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oauth-integrity-'));
    try {
      const path = join(directory, 'provider.jar');
      const bytes = Buffer.from('verified synthetic fixture');
      const digest = createHash('sha256').update(bytes).digest('hex');
      await writeFile(path, bytes);
      expect(await artifact(directory, 'https://example.invalid/provider.jar', digest)).toBe(path);
      await writeFile(path, 'tampered');
      await expect(artifact(directory, 'https://example.invalid/provider.jar', digest)).rejects.toThrow('integrity');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});


class UnreadyProvider extends Provider {
  protected override async command(): Promise<string[]> {
    return [process.execPath, '-e', 'setInterval(() => {}, 1000)'];
  }
}

class FailedProvider extends Provider {
  protected override async command(): Promise<string[]> {
    throw new Error('synthetic-secret');
  }
}

test('startup failure and readiness timeout clean isolated directories', async () => {
  for (const fixture of [FailedProvider, UnreadyProvider]) {
    const provider = new fixture('replay', '', 0);
    await expect(provider.start()).rejects.toThrow('OAuth infrastructure startup failed (wiremock-java)');
    expect(existsSync(provider.directory)).toBe(false);
    await provider.close();
  }
});

test('bounded process timeout kills and reaps the owned process', async () => {
  const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)']);
  await expect(bounded(child, 50)).rejects.toThrow('process failed');
  expect(child.signalCode).toBe('SIGKILL');
});

test('macOS CI cache failure cannot fall back to Docker or replay', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'oauth-java-failure-'));
  const provider = new Provider('live', cache, 0, 'darwin', 'true');
  try {
    await writeFile(join(cache, 'keycloak-26.2.5.tar.gz'), 'tampered');
    await expect(provider.start()).rejects.toThrow('OAuth infrastructure startup failed (keycloak-java)');
    expect(existsSync(provider.directory)).toBe(false);
    expect(await readdir(cache)).toEqual(['keycloak-26.2.5.tar.gz']);
  } finally { await provider.close(); await rm(cache, { recursive: true, force: true }); }
});

test('failed download verification does not populate the artifact cache', async () => {
  fetchMock.hardReset();
  const cache = await mkdtemp(join(tmpdir(), 'oauth-download-'));
  const server = Bun.serve({ port: 0, fetch: () => new Response('tampered') });
  try {
    await expect(artifact(cache, `${server.url}provider.jar`, 'invalid')).rejects.toThrow('integrity');
    expect(await readdir(cache)).toEqual([]);
  } finally { server.stop(true); await rm(cache, { recursive: true, force: true }); }
});

class CleanupProvider extends UnreadyProvider {
  removals: string[] = [];
  failRemoval = true;
  ownContainer(): void { this.container = 'sunday-owned-fixture'; }
  protected override async removeContainer(name: string): Promise<void> {
    this.removals.push(name);
    if (this.failRemoval) throw new Error('synthetic-secret');
  }
}

test('failed container removal reports failure, finishes local cleanup, and retries', async () => {
  const provider = new CleanupProvider('replay', '', 0);
  provider.directory = await mkdtemp(join(tmpdir(), 'oauth-cleanup-'));
  provider.ownContainer();
  await expect(provider.close()).rejects.toThrow('container cleanup failed');
  expect(existsSync(provider.directory)).toBe(false);
  provider.failRemoval = false;
  await provider.close();
  await provider.close();
  expect(provider.removals).toEqual(['sunday-owned-fixture', 'sunday-owned-fixture']);
});
