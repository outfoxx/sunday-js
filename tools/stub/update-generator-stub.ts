#!/usr/bin/env bun
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { isAbsolute, resolve } from 'path';

/**
 * Generates a compile-only stub package for typecheck fixtures.
 * This package is not intended to provide runtime behavior.
 */
const COMPILE_ONLY_INDEX_JS = 'export {};\n';
const root = resolve(import.meta.dir, '../..');
const outDir = resolve(root, 'tools/stub/out');
const rootPackagePath = resolve(root, 'package.json');

type RootPackageManifest = {
  name: string;
  dependencies: Record<string, string>;
};

type StubPackageManifest = {
  name: string;
  version: string;
  type: 'module';
  main: 'index.js';
  types: 'index.d.ts';
  exports: {
    '.': {
      types: './index.d.ts';
      import: './index.js';
    };
    './*': {
      types: './index.d.ts';
      import: './index.js';
    };
    './package.json': './package.json';
  };
  dependencies: Record<string, string>;
};

export function resolveTargetDir(target: string): string {
  return isAbsolute(target) ? target : resolve(root, target);
}

async function buildStubDeclarations(): Promise<void> {
  const build = Bun.spawn(['bun', 'run', 'build:stub'], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const buildExit = await build.exited;
  if (buildExit !== 0) {
    process.exit(buildExit);
  }
}

async function readRootPackageManifest(): Promise<RootPackageManifest> {
  const contents = await readFile(rootPackagePath, 'utf8');
  return JSON.parse(contents) as RootPackageManifest;
}

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
  const specifiers = new Set<string>();
  const fromPattern = /from\s+['"]([^'"]+)['"]/g;
  const importPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [fromPattern, importPattern]) {
    let match: RegExpExecArray | null = pattern.exec(declarations);
    while (match) {
      const packageName = toPackageName(match[1]);
      if (packageName) {
        specifiers.add(packageName);
      }
      match = pattern.exec(declarations);
    }
  }

  return [...specifiers].sort();
}

function buildStubManifest(
  rootManifest: RootPackageManifest,
  declarations: string,
): StubPackageManifest {
  const declarationDependencies = parseDeclarationDependencies(declarations);
  const dependencies: Record<string, string> = {};

  for (const dependency of declarationDependencies) {
    const version = rootManifest.dependencies[dependency];
    if (!version) {
      throw new Error(
        `Declaration dependency "${dependency}" is not present in root package dependencies`,
      );
    }
    dependencies[dependency] = version;
  }

  return {
    name: rootManifest.name,
    version: '0.0.0-test',
    type: 'module',
    main: 'index.js',
    types: 'index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
      './*': {
        types: './index.d.ts',
        import: './index.js',
      },
      './package.json': './package.json',
    },
    dependencies,
  };
}

type UpdateGeneratorStubOptions = {
  skipBuild?: boolean;
};

export async function updateGeneratorStub(
  target: string,
  options: UpdateGeneratorStubOptions = {},
): Promise<void> {
  if (!options.skipBuild) {
    await buildStubDeclarations();
  }
  const targetDir = resolveTargetDir(target);
  const [rootManifest, declarations] = await Promise.all([
    readRootPackageManifest(),
    readFile(resolve(outDir, 'index.d.ts'), 'utf8'),
  ]);
  const stubManifest = buildStubManifest(rootManifest, declarations);

  await mkdir(targetDir, { recursive: true });
  await copyFile(resolve(outDir, 'index.d.ts'), resolve(targetDir, 'index.d.ts'));
  await writeFile(resolve(targetDir, 'index.js'), COMPILE_ONLY_INDEX_JS);
  await writeFile(
    resolve(targetDir, 'package.json'),
    `${JSON.stringify(stubManifest, null, 2)}\n`,
  );
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: bun tools/stub/update-generator-stub.ts <target-dir>');
    process.exit(1);
  }
  await updateGeneratorStub(target, {
    skipBuild: process.env.SUNDAY_STUB_SKIP_BUILD === '1',
  });
}
