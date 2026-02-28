#!/usr/bin/env bun
import { mkdir, copyFile } from 'fs/promises';
import { resolve } from 'path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: bun tools/stub/update-generator-stub.ts <target-dir>');
  process.exit(1);
}

const root = resolve(import.meta.dir, '../..');
const outDir = resolve(root, 'tools/stub/out');
const targetDir = resolve(target);

const build = Bun.spawn(['bun', 'run', 'build:stub'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
});

const buildExit = await build.exited;
if (buildExit !== 0) {
  process.exit(buildExit);
}

await mkdir(targetDir, { recursive: true });
await copyFile(resolve(outDir, 'index.d.ts'), resolve(targetDir, 'index.d.ts'));
await copyFile(resolve(outDir, 'index.js'), resolve(targetDir, 'index.js'));
await copyFile(resolve(outDir, 'package.json'), resolve(targetDir, 'package.json'));
