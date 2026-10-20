import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { waitForNpmRelease } from './wait-for-npm-release.mjs';

const tarball = new TextEncoder().encode('package contents');
const shasum = createHash('sha1').update(tarball).digest('hex');
const tarballUrl = 'https://registry.npmjs.org/@outfoxx/sunday/-/sunday-2.0.0-beta.13.tgz';
const version = '2.0.0-beta.13';

function metadata(target = version, tag = 'beta', taggedVersion = target) {
  return {
    versions: { [target]: { dist: { tarball: tarballUrl, shasum } } },
    'dist-tags': { [tag]: taggedVersion },
  };
}

function harness(responses, attempts = 3) {
  const requests = [];
  const pauses = [];
  return {
    requests,
    pauses,
    options: {
      attempts,
      log: () => {},
      pause: async (ms) => { pauses.push(ms); },
      fetch: async (url) => {
        requests.push(url);
        assert.ok(responses.length, 'unexpected registry request');
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
}

test('waits for version, beta dist-tag, and tarball independently', async () => {
  const h = harness([
    Response.json({ versions: {}, 'dist-tags': { beta: '2.0.0-beta.12' } }),
    Response.json(metadata(version, 'beta', '2.0.0-beta.12')),
    Response.json(metadata()),
    new Response(null, { status: 404 }),
    Response.json(metadata()),
    new Response(tarball),
  ], 4);
  await waitForNpmRelease('@outfoxx/sunday', `v${version}`, h.options);
  assert.equal(h.requests.length, 6);
  assert.equal(h.requests[0], 'https://registry.npmjs.org/%40outfoxx%2Fsunday');
  assert.equal(h.requests[3], tarballUrl);
  assert.deepEqual(h.pauses, [15000, 15000, 15000]);
});

test('stable releases verify latest instead of beta', async () => {
  const h = harness([Response.json(metadata('2.0.0', 'latest')), new Response(tarball)]);
  await waitForNpmRelease('@outfoxx/sunday', '2.0.0', h.options);
  assert.deepEqual(h.pauses, []);
});

test('other prereleases verify their own dist-tag', async () => {
  const h = harness([Response.json(metadata('2.0.0-rc.1', 'rc')), new Response(tarball)]);
  await waitForNpmRelease('@outfoxx/sunday', '2.0.0-rc.1', h.options);
  assert.deepEqual(h.pauses, []);
});

test('retries transient HTTP and network failures', async () => {
  const h = harness([
    new Response(null, { status: 503 }),
    new Error('network unavailable'),
    Response.json(metadata()),
    new Response(tarball),
  ]);
  await waitForNpmRelease('@outfoxx/sunday', version, h.options);
  assert.equal(h.pauses.length, 2);
});

test('fails after the retry budget without a final sleep', async () => {
  const h = harness([Response.json({}), Response.json({})], 2);
  await assert.rejects(waitForNpmRelease('@outfoxx/sunday', version, h.options),
    /npm publication did not become available: Version 2.0.0-beta.13 is not visible/);
  assert.equal(h.requests.length, 2);
  assert.equal(h.pauses.length, 1);
});

test('rejects a downloaded tarball with the wrong checksum', async () => {
  const h = harness([Response.json(metadata()), new Response('wrong package')], 1);
  await assert.rejects(waitForNpmRelease('@outfoxx/sunday', version, h.options),
    /Tarball checksum does not match npm metadata/);
});
