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
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { testBrowsers } from './browser-support';

describe('browser request stream copying', () => {
  let directory: string;
  let server: ChildProcess;
  let base: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sunday-browser-upload-'));
    const certificate = Bun.spawn(
      [
        'openssl',
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    expect(await certificate.exited).toBe(0);
    const bundle = await Bun.build({
      entrypoints: ['./tools/ci/browser-runtime.ts'],
      target: 'browser',
      format: 'esm',
    });
    expect(bundle.success).toBe(true);
    await Bun.write(join(directory, 'runtime.js'), bundle.outputs[0]);
    server = spawn('node', ['tools/ci/browser-upload-server.mjs', directory], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: server.stdout! });
    try {
      [base] = await once(lines, 'line', {
        signal: AbortSignal.timeout(10000),
      });
    } finally {
      lines.close();
    }
  }, 15000);

  afterAll(async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  for (const engine of testBrowsers) {
    it(`${engine.name()}: matches native SSE framing across byte boundaries`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(base);
        const checks = await page.evaluate(async (base) => {
          const sunday = await import(base + '/runtime.js');
          const { checkSSEFraming } = await import(
            base + '/sse-framing-checks.js'
          );
          return checkSSEFraming(sunday, sunday.EventParser, base, true);
        }, base);
        expect(checks).toBeGreaterThan(500);
      } finally {
        await browser.close();
      }
    }, 30000);
    it(`${engine.name()}: preserves operation and connection lifetimes`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(base);
        const checks = await page.evaluate(async (base) => {
          const sunday = await import(base + '/runtime.js');
          const { checkLifecycle } = await import(
            base + '/lifecycle-checks.js'
          );
          return sunday.runBrowserChecks((progress: (label: string) => void) =>
            checkLifecycle(sunday, base, progress),
          );
        }, base);
        expect(checks).toBeGreaterThanOrEqual(80);
      } finally {
        await browser.close();
      }
    }, 30000);
    it(`${engine.name()}: preserves body ownership, error provenance, and native byte streams`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.exposeFunction('collectGarbage', () => page.requestGC());
        await page.goto(base);
        const checks = await page.evaluate(async (base) => {
          const sunday = await import(base + '/runtime.js');
          const { checkBodyOwnership } = await import(
            base + '/body-ownership-checks.js'
          );
          return sunday.runBrowserChecks((progress: (label: string) => void) =>
            checkBodyOwnership(sunday, base, progress, () =>
              (
                globalThis as typeof globalThis & {
                  collectGarbage: () => Promise<void>;
                }
              ).collectGarbage(),
            ),
          );
        }, base);
        expect(checks).toBeGreaterThanOrEqual(120);
      } finally {
        await browser.close();
      }
    }, 30000);

    it(`${engine.name()}: preserves async ownership, recovery, and cancellation identity`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(base);
        const checks = await page.evaluate(async (base) => {
          const sunday = await import(base + '/runtime.js');
          const { checkAsyncExecution } = await import(
            base + '/async-execution-checks.js'
          );
          return checkAsyncExecution(sunday, base);
        }, base);
        expect(checks).toBe(112);
      } finally {
        await browser.close();
      }
    }, 30000);

    it(`${engine.name()}: compares native and Sunday copying and actual upload support`, async () => {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ ignoreHTTPSErrors: true });
        await page.goto(base);
        const result = await page.evaluate(async (base) => {
          const {
            copyRequest,
            authenticationAdapters,
            FetchTransport,
            StreamingBody,
            StringSchema,
            MediaType,
            prepareRequestBody,
            supportsStreamingUploads,
          } = (await import(base + '/runtime.js')) as typeof import('../src');
          const fresh = () =>
            new Request(base + '/echo', {
              method: 'POST',
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('payload'));
                  controller.close();
                },
              }),
              duplex: 'half',
            } as RequestInit);
          const bodies: string[] = [];
          const uploads: string[] = [];
          for (const copy of [
            (r: Request) => r,
            (r: Request) => new Request(r, { headers: { 'X-Copy': 'native' } }),
            (r: Request) =>
              copyRequest(copyRequest(r), { headers: { 'X-Copy': 'sunday' } }),
          ]) {
            const signal = AbortSignal.timeout(5000);
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              bodies.push(
                await Promise.race([
                  copy(fresh()).text(),
                  new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(
                      () => reject(new Error('Copied request body stalled')),
                      5000,
                    );
                  }),
                ]),
              );
            } finally {
              clearTimeout(timer);
            }
            try {
              const response = await fetch(copy(fresh()), { signal });
              uploads.push(await response.json());
            } catch (error) {
              if (signal.aborted) throw error;
              uploads.push((error as Error).name);
            }
          }
          const { checkRequestBody } = await import(
            base + '/request-body-checks.js'
          );
          const bodyChecks = await checkRequestBody(
            await import(base + '/runtime.js'),
            uploads[0] === 'payload',
          );
          const makeStream = () =>
            new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(new TextEncoder().encode('compatible upload'));
                c.close();
              },
            });
          const compatibilityUploads: string[] = [];
          for (const queryCredentials of [false, true]) {
            for (const adapter of [false, true]) {
              const client = new FetchTransport(base, {
                ...authenticationAdapters(
                  {
                    application: {
                      identity: 'browser',
                      configure: () => ({ clientIdentity: 'test' }),
                      acquire: async () => ({ accessToken: 'secret' }),
                    },
                  },
                  adapter
                    ? {
                        async adapt(request) {
                          const body = await prepareRequestBody(makeStream(), {
                            signal: request.signal,
                          });
                          return copyRequest(request, { body, duplex: 'half' });
                        },
                      }
                    : undefined,
                  undefined,
                ),
                logger: {},
              });
              compatibilityUploads.push(
                await client.result(
                  {
                    method: 'POST',
                    pathTemplate: '/echo',
                    signal: AbortSignal.timeout(5000),
                    body: adapter
                      ? undefined
                      : StreamingBody.stream(makeStream),
                    security: queryCredentials
                      ? [
                          {
                            scheme: 'auth',
                            provider: 'application',
                            profile: 'external',
                            flow: 'external',
                            scopes: [],
                            transport: { location: 'query', name: 'token' },
                          },
                        ]
                      : undefined,
                    contentTypes: [MediaType.OctetStream],
                  },
                  StringSchema,
                ),
              );
            }
          }
          if (!supportsStreamingUploads()) {
            const stop = new Error('fallback source failed');
            const client = new FetchTransport(base, {
              logger: {},
              maxBufferedRequestBytes: 3,
            });
            const error = await client
              .result(
                {
                  method: 'POST',
                  pathTemplate: '/echo',
                  contentTypes: [MediaType.OctetStream],
                  body: StreamingBody.stream(
                    () =>
                      new ReadableStream({
                        start(c) {
                          c.error(stop);
                        },
                      }),
                  ),
                },
                StringSchema,
              )
              .catch((error) => error);
            if (error !== stop)
              throw new Error('Transport lost source error identity');
            for (const adapter of [false, true]) {
              const abort = new AbortController();
              const reason = new Error('fallback cancelled');
              let entered!: () => void;
              const started = new Promise<void>((resolve) => {
                entered = resolve;
              });
              let cancelledWith: unknown;
              const pendingStream = () =>
                new ReadableStream<Uint8Array>(
                  {
                    pull() {
                      entered();
                      return new Promise(() => {});
                    },
                    cancel(value) {
                      cancelledWith = value;
                      return new Promise(() => {});
                    },
                  },
                  { highWaterMark: 0 },
                );
              const cancellable = new FetchTransport(base, {
                logger: {},
                requestAdapter: adapter
                  ? {
                      async adapt(request) {
                        const body = await prepareRequestBody(pendingStream(), {
                          signal: request.signal,
                        });
                        return copyRequest(request, { body });
                      },
                    }
                  : undefined,
              });
              const pending = cancellable
                .result(
                  {
                    method: 'POST',
                    pathTemplate: '/echo',
                    signal: abort.signal,
                    body: adapter
                      ? undefined
                      : StreamingBody.stream(pendingStream),
                    contentTypes: [MediaType.OctetStream],
                  },
                  StringSchema,
                )
                .catch((error) => error);
              await started;
              abort.abort(reason);
              if ((await pending) !== reason)
                throw new Error('Fallback cancellation identity was lost');
              if (cancelledWith !== reason)
                throw new Error('Fallback source was not cancelled');
            }

            const limit = await client
              .transportRequest({
                method: 'POST',
                pathTemplate: '/echo',
                contentTypes: [MediaType.OctetStream],
                body: StreamingBody.stream(makeStream),
              })
              .catch((error) => error);
            if (!(limit instanceof RangeError))
              throw new Error('Transport ignored buffer bound');
          }

          // Prove bytes leave the browser before the producer closes, not merely that a
          // closed stream can be buffered. Run on every engine that accepts the upload.
          let streamedBeforeClose: boolean | undefined;
          let echoed: string | undefined;
          if (uploads[0] === 'payload') {
            const id = crypto.randomUUID();
            let controller!: ReadableStreamDefaultController<Uint8Array>;
            const body = StreamingBody.stream(
              () =>
                new ReadableStream({
                  start(value) {
                    controller = value;
                    controller.enqueue(new TextEncoder().encode('first'));
                  },
                }),
            );
            const client = new FetchTransport(base, {
              logger: {},
              requestAdapter: { adapt: (r) => copyRequest(copyRequest(r)) },
            });
            const signal = AbortSignal.timeout(5000);
            const pending = client.result(
              {
                method: 'POST',
                pathTemplate: '/echo',
                queryParameters: { id },
                body,
                contentTypes: [MediaType.OctetStream],
                signal,
              },
              StringSchema,
            );
            // Attach rejection handling before polling, retaining the failure for the final await.
            void pending.catch(() => {});
            try {
              do {
                streamedBeforeClose = await (
                  await fetch(base + '/progress?id=' + id, { signal })
                ).json();
                if (!streamedBeforeClose)
                  await new Promise((resolve) => setTimeout(resolve, 10));
              } while (!streamedBeforeClose);
              controller.enqueue(new TextEncoder().encode('second'));
              controller.close();
              echoed = await pending;
            } catch (error) {
              controller.error(error);
              throw error;
            }
          }
          return {
            bodies,
            uploads,
            streamedBeforeClose,
            echoed,
            compatibilityUploads,
            bodyChecks,
          };
        }, base);
        await Bun.write(
          `reports/browser-streaming-${engine.name()}.json`,
          JSON.stringify(
            {
              playwright: (
                await Bun.file('node_modules/playwright/package.json').json()
              ).version,
              browser: engine.name(),
              version: browser.version(),
              ...result,
            },
            null,
            2,
          ) + '\n',
        );
        expect(result.compatibilityUploads).toEqual([
          'compatible upload',
          'compatible upload',
          'compatible upload',
          'compatible upload',
        ]);
        expect(result.bodyChecks).toBeGreaterThan(30);
        if (engine.name() !== 'firefox') {
          expect(result).toEqual({
            bodies: ['payload', 'payload', 'payload'],
            uploads: ['payload', 'payload', 'payload'],
            streamedBeforeClose: true,
            echoed: 'firstsecond',
            compatibilityUploads: result.compatibilityUploads,
            bodyChecks: result.bodyChecks,
          });
        } else {
          // Firefox 159 coerces ReadableStream to a string; this is not upload support.
          expect(result.bodies).toEqual(
            Array(3).fill('[object ReadableStream]'),
          );
          expect(result.uploads).toEqual(
            Array(3).fill('[object ReadableStream]'),
          );
        }
      } finally {
        await browser.close();
      }
    }, 20000);
  }
});
