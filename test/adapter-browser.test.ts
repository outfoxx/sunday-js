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
import { chromium, firefox, webkit } from 'playwright';

describe('browser Fetch adapter behavior', () => {
  for (const engine of [chromium, firefox, webkit]) {
    it(`${engine.name()}: preserves native redirects, opaque credentialed redirects, and abort identity`, async () => {
      const bundle = await Bun.build({
        entrypoints: ['./src/index.ts'],
        target: 'browser',
        format: 'esm',
      });
      expect(bundle.success).toBe(true);
      let leaked = false;
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request) => {
          const path = new URL(request.url).pathname;
          if (path === '/runtime.js')
            return new Response(bundle.outputs[0], {
              headers: { 'Content-Type': 'text/javascript' },
            });
          if (path === '/redirect')
            return new Response(null, {
              status: 307,
              headers: { Location: '/echo' },
            });
          if (path === '/echo') return Response.json(await request.text());
          if (path === '/guarded')
            return new Response(null, {
              status: 302,
              headers: { Location: '/leak' },
            });
          if (path === '/leak') {
            leaked = true;
            return Response.json('leaked');
          }
          if (path === '/stalled')
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('"'));
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            );
          return new Response(
            '<!doctype html><title>Fetch adapter tests</title>',
            { headers: { 'Content-Type': 'text/html' } },
          );
        },
      });
      const browser = await engine.launch();
      try {
        const page = await browser.newPage();
        const base = `http://127.0.0.1:${server.port}`;
        await page.goto(base);
        const observed = await page.evaluate(async (base) => {
          const {
            FetchTransport,
            MediaType,
            StringSchema,
            RequestCancellationError,
            copyRequest,
          } = (await import(base + '/runtime.js')) as typeof import('../src');
          let requests = 0,
            responses = 0;
          const transport = new FetchTransport(base, {
            logger: {},
            requestAdapter: {
              adapt(request) {
                requests++;
                return copyRequest(request, { headers: { 'X-Test': 'yes' } });
              },
            },
            responseAdapter: {
              adapt(response) {
                responses++;
                return response;
              },
            },
          });
          const echoed = await transport.result(
            {
              method: 'POST',
              pathTemplate: '/redirect',
              body: 'payload',
              contentTypes: [MediaType.Plain],
            },
            StringSchema,
          );
          const stop = new RequestCancellationError('opaque response');
          let opaque: string | undefined;
          const guarded = new FetchTransport(base, {
            requestAdapter: {
              adapt(request) {
                request.headers.set('Authorization', 'Bearer secret');
                return request;
              },
            },
            responseAdapter: {
              adapt(response) {
                opaque = response.type;
                throw stop;
              },
            },
          });
          const guardedFailure = await guarded
            .transportResponse({ method: 'GET', pathTemplate: '/guarded' })
            .catch((error) => error);
          let enter!: () => void;
          const entered = new Promise<void>((resolve) => {
            enter = resolve;
          });
          const abort = new AbortController(),
            reason = new Error('application abort');
          const stalled = new FetchTransport(base, {
            responseAdapter: {
              async adapt(response) {
                enter();
                await response.text();
                return response;
              },
            },
          });
          const pending = stalled
            .result(
              { method: 'GET', pathTemplate: '/stalled', signal: abort.signal },
              StringSchema,
            )
            .catch((error) => error);
          await entered;
          abort.abort(reason);
          const failure = await pending;
          return {
            echoed,
            requests,
            responses,
            opaque,
            stopped: guardedFailure === stop,
            cancelled: failure === reason,
          };
        }, base);
        expect(observed).toEqual({
          echoed: 'payload',
          requests: 1,
          responses: 1,
          opaque: 'opaqueredirect',
          stopped: true,
          cancelled: true,
        });
        expect(leaked).toBe(false);
      } finally {
        await browser.close();
        await server.stop(true);
      }
    }, 15000);
  }
});
