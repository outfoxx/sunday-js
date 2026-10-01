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

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createServer, Server } from 'node:http';
import fetchMock from 'fetch-mock';
import { FetchTransport, MediaType, SecurityBinding, StreamingBody, TokenManager } from '../src';

/** Real sockets catch streaming regressions that request-consuming fetch mocks cannot reproduce. */
describe('secured streaming requests', () => {
  let server: Server;

  beforeEach(() => { fetchMock.hardReset(); });
  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  for (const location of ['header', 'query', 'cookie'] as const) {
    it(`sends a streaming body with ${location} credentials without replaying it`, async () => {
      const received: Buffer[] = [];
      let requests = 0;
      let credential: string | undefined;
      server = createServer((request, response) => {
        requests++;
        credential = location === 'query' ? new URL(request.url!, 'http://localhost').searchParams.get('key') ?? undefined :
          location === 'cookie' ? request.headers.cookie : request.headers.authorization;
        request.on('data', chunk => received.push(chunk));
        request.on('end', () => {
          response.writeHead(401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });
          response.end();
        });
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected an HTTP server address');
      const binding: SecurityBinding = {
        scheme: 'token', provider: 'application', flow: 'external', profile: 'external', scopes: [],
        transport: { location, name: location === 'header' ? 'Authorization' : 'key', prefix: location === 'header' ? 'Bearer' : undefined },
      };
      const client = new FetchTransport(`http://127.0.0.1:${address.port}`, { tokenManager: new TokenManager({ application: {
        identity: 'test', configure: () => ({ clientIdentity: 'test' }), acquire: async () => ({ accessToken: 'secret' }),
      } }) });
      const payload = new Uint8Array(196608).fill(123);
      let iterations = 0;
      const body = StreamingBody.bytes(async function* () { iterations++; yield payload; });
      await expect(client.transportResponse({
        method: 'POST', pathTemplate: '/upload', body, contentTypes: [MediaType.OctetStream],
        security: [binding], signal: AbortSignal.timeout(3000),
      })).rejects.toMatchObject({ status: 401 });
      expect(credential).toBe(location === 'header' ? 'Bearer secret' : location === 'cookie' ? 'key=secret' : 'secret');
      expect(Buffer.concat(received)).toEqual(Buffer.from(payload));
      expect(requests).toBe(1);
      expect(iterations).toBe(1);
    });
  }
});
