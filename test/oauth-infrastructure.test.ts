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
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifact, backend } from './oauth-support/provider';

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
