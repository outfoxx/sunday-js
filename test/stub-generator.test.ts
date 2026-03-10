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
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const scriptPath = resolve(root, 'tools/stub/update-generator-stub.ts');

type RootPackageManifest = {
  dependencies: Record<string, string>;
};

function toPackageName(specifier: string): string | undefined {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('node:') ||
    specifier.startsWith('bun:')
  ) {
    return undefined;
  }

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) {
      return undefined;
    }
    return `${parts[0]}/${parts[1]}`;
  }

  return specifier.split('/')[0];
}

function parseDeclarationDependencies(declarations: string): string[] {
  const dependencies = new Set<string>();
  const fromPattern = /from\s+['"]([^'"]+)['"]/g;
  const importPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [fromPattern, importPattern]) {
    let match: RegExpExecArray | null = pattern.exec(declarations);
    while (match) {
      const packageName = toPackageName(match[1]);
      if (packageName) {
        dependencies.add(packageName);
      }
      match = pattern.exec(declarations);
    }
  }

  return [...dependencies].sort();
}

async function expectedDependenciesFromDeclarations(
  declarationsPath: string,
): Promise<Record<string, string>> {
  const [declarations, rootPackageContents] = await Promise.all([
    readFile(declarationsPath, 'utf8'),
    readFile(resolve(root, 'package.json'), 'utf8'),
  ]);

  const rootPackage = JSON.parse(rootPackageContents) as RootPackageManifest;
  const expectedDependencies: Record<string, string> = {};

  for (const dependency of parseDeclarationDependencies(declarations)) {
    const version = rootPackage.dependencies[dependency];
    if (!version) {
      throw new Error(
        `Declaration dependency "${dependency}" not found in root package dependencies`,
      );
    }
    expectedDependencies[dependency] = version;
  }

  return expectedDependencies;
}

async function runStubGenerator(targetDir: string, cwd: string): Promise<void> {
  const childProcess = Bun.spawn(['bun', scriptPath, targetDir], {
    cwd,
    env: {
      ...process.env,
      SUNDAY_STUB_SKIP_BUILD: '1',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text(),
    childProcess.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `update-generator-stub failed (${exitCode})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
}

describe('update-generator-stub', () => {
  it(
    'writes a portable stub package for relative target paths resolved from repository root',
    async () => {
      const tempCwd = await mkdtemp(join(tmpdir(), 'sunday-stub-cwd-'));
      const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const relativeTarget = `.tmp/stub-generator-${uniqueId}/relative`;
      const expectedTarget = resolve(root, relativeTarget);
      const unexpectedTarget = resolve(tempCwd, relativeTarget);

      try {
        await runStubGenerator(relativeTarget, tempCwd);
        const firstIndexJs = await readFile(resolve(expectedTarget, 'index.js'), 'utf8');
        const firstPackageJson = await readFile(
          resolve(expectedTarget, 'package.json'),
          'utf8',
        );
        const indexDtsStat = await stat(resolve(expectedTarget, 'index.d.ts'));
        expect(indexDtsStat.size).toBeGreaterThan(0);
        expect(firstIndexJs).toBe('export {};\n');
        expect(firstIndexJs).not.toContain('../../build/index.js');

        const packageJson = JSON.parse(firstPackageJson) as {
          name: string;
          version: string;
          type: string;
          main: string;
          types: string;
          exports: {
            '.': { types: string; import: string };
            './*': { types: string; import: string };
            './package.json': string;
          };
          dependencies: Record<string, string>;
        };
        const expectedDependencies = await expectedDependenciesFromDeclarations(
          resolve(expectedTarget, 'index.d.ts'),
        );

        expect(packageJson.name).toBe('@outfoxx/sunday');
        expect(packageJson.version).toBe('0.0.0-test');
        expect(packageJson.type).toBe('module');
        expect(packageJson.main).toBe('index.js');
        expect(packageJson.types).toBe('index.d.ts');
        expect(packageJson.exports['.'].types).toBe('./index.d.ts');
        expect(packageJson.exports['.'].import).toBe('./index.js');
        expect(packageJson.exports['./*'].types).toBe('./index.d.ts');
        expect(packageJson.exports['./*'].import).toBe('./index.js');
        expect(packageJson.exports['./package.json']).toBe('./package.json');
        expect(packageJson.dependencies).toEqual(expectedDependencies);

        await runStubGenerator(relativeTarget, tempCwd);
        const secondIndexJs = await readFile(resolve(expectedTarget, 'index.js'), 'utf8');
        const secondPackageJson = await readFile(
          resolve(expectedTarget, 'package.json'),
          'utf8',
        );
        expect(secondIndexJs).toBe(firstIndexJs);
        expect(secondPackageJson).toBe(firstPackageJson);

        await expect(stat(unexpectedTarget)).rejects.toThrow();
      } finally {
        await rm(resolve(root, `.tmp/stub-generator-${uniqueId}`), {
          recursive: true,
          force: true,
        });
        await rm(tempCwd, { recursive: true, force: true });
      }
    },
    120000,
  );

  it(
    'writes the same package shape for absolute target paths',
    async () => {
      const tempTargetRoot = await mkdtemp(join(tmpdir(), 'sunday-stub-abs-'));
      const absoluteTarget = resolve(tempTargetRoot, 'output');

      try {
        await runStubGenerator(absoluteTarget, root);
        expect(await readFile(resolve(absoluteTarget, 'index.js'), 'utf8')).toBe(
          'export {};\n',
        );
        expect(await readFile(resolve(absoluteTarget, 'index.d.ts'), 'utf8')).not.toHaveLength(
          0,
        );

        const packageJson = JSON.parse(
          await readFile(resolve(absoluteTarget, 'package.json'), 'utf8'),
        ) as {
          name: string;
          exports: { '.': { import: string }; './*': { import: string } };
        };
        expect(packageJson.name).toBe('@outfoxx/sunday');
        expect(packageJson.exports['.'].import).toBe('./index.js');
        expect(packageJson.exports['./*'].import).toBe('./index.js');
      } finally {
        await rm(tempTargetRoot, { recursive: true, force: true });
      }
    },
    120000,
  );
});
