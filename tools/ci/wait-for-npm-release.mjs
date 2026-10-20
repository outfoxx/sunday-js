import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Wait for public npm metadata and a matching downloadable package.
 * Dependency overrides allow propagation failures to be tested without delays.
 */
export async function waitForNpmRelease(name, packageVersion, {
  fetch: fetchRegistry = globalThis.fetch,
  pause = sleep,
  log = console.log,
  attempts = 60,
  intervalMs = 15000,
} = {}) {
  // Tag validation can retain the Git tag's prefix; npm normalizes it away.
  const version = packageVersion.replace(/^v/, '');
  const distTag = version.includes('-')
    ? version.slice(version.indexOf('-') + 1).split('.')[0]
    : 'latest';
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const options = {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(10000),
      };
      const response = await fetchRegistry(metadataUrl, options);
      if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
      const metadata = await response.json();
      const manifest = metadata.versions?.[version];
      if (!manifest) throw new Error(`Version ${version} is not visible`);
      if (metadata['dist-tags']?.[distTag] !== version) {
        throw new Error(`Dist-tag ${distTag} points to ${metadata['dist-tags']?.[distTag] ?? 'nothing'}`);
      }
      const { tarball, shasum } = manifest.dist ?? {};
      if (!tarball || !shasum) throw new Error('Tarball metadata is incomplete');
      const download = await fetchRegistry(tarball, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(10000),
      });
      if (!download.ok) throw new Error(`Tarball HTTP ${download.status}`);
      const bytes = new Uint8Array(await download.arrayBuffer());
      if (createHash('sha1').update(bytes).digest('hex') !== shasum) {
        throw new Error('Tarball checksum does not match npm metadata');
      }
      log(`Verified ${name}@${version}: ${distTag} dist-tag and package tarball are available.`);
      return;
    } catch (error) {
      lastError = error;
      log(`Waiting for npm (${attempt}/${attempts}): ${error.message}`);
      if (attempt < attempts) await pause(intervalMs);
    }
  }
  throw new Error(`npm publication did not become available: ${lastError.message}`, { cause: lastError });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { name, version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
  await waitForNpmRelease(name, version);
}
