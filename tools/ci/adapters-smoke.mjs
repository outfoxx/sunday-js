import { EventParser } from '@outfoxx/sunday/event-parser';
import { checkSSEFraming } from './sse-framing-checks.mjs';
import * as sunday from '@outfoxx/sunday';
import { checkLifecycle } from './lifecycle-checks.mjs';
import { checkBodyOwnership } from './body-ownership-checks.mjs';
import { checkAsyncExecution } from './async-execution-checks.mjs';
import { asyncExecutionRoute } from './async-execution-fixture.mjs';
import { checkRequestBody } from './request-body-checks.mjs';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import {
  FetchTransport,
  MediaType,
  StringSchema,
  StreamingBody,
  RequestCancellationError,
  copyRequest,
} from '@outfoxx/sunday';

const server = createServer((request, response) => {
  request.on('error', () => {});
  response.on('error', () => {});
  if (asyncExecutionRoute(request, response)) return;
  if (request.url === '/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end('data: body\n\n');
    return;
  }
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    if (request.url === '/redirect') {
      response.writeHead(307, { Location: '/echo' });
      response.end();
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(Buffer.concat(chunks).toString() || 'body'));
    }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const watchdog = setTimeout(() => {
    throw new Error('Shared adapter checks stalled');
  }, 10000);
  try {
    await checkRequestBody(sunday, true);
    console.log(
      `${await checkSSEFraming(sunday, EventParser, base)} SSE framing checks passed`,
    );
    console.log(
      `${await checkLifecycle(sunday, base)} lifecycle checks passed`,
    );
    console.log(
      `${await checkBodyOwnership(sunday, base)} body ownership checks passed`,
    );
    console.log(
      `${await checkAsyncExecution(sunday, base)} async execution checks passed`,
    );
  } finally {
    clearTimeout(watchdog);
  }
  const upload = new FetchTransport(base, {
    logger: {},
    requestAdapter: {
      async adapt(request) {
        const body = await sunday.prepareRequestBody(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('adapter upload'));
              controller.close();
            },
          }),
          { signal: request.signal },
        );
        return copyRequest(request, { body, duplex: 'half' });
      },
    },
  });
  assert.equal(
    await upload.result(
      { method: 'POST', pathTemplate: '/echo' },
      StringSchema,
    ),
    'adapter upload',
  );
  let requests = 0,
    responses = 0;
  const client = new FetchTransport(base, {
    logger: {},
    requestAdapter: {
      adapt(request) {
        requests++;
        return copyRequest(request, { headers: { 'X-Adapted': 'yes' } });
      },
    },
    responseAdapter: {
      adapt(response) {
        responses++;
        return response;
      },
    },
  });
  assert.equal(
    await client.result(
      {
        method: 'POST',
        pathTemplate: '/redirect',
        body: 'payload',
        contentTypes: [MediaType.Plain],
      },
      StringSchema,
    ),
    'payload',
  );
  assert.deepEqual([requests, responses], [1, 1]);

  for (const inAdapter of [false, true]) {
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    const abort = new AbortController(),
      reason = new Error('external cancellation');
    const stalled = new FetchTransport(base, {
      logger: {},
      responseAdapter: {
        async adapt(response) {
          entered();
          if (inAdapter) await response.text();
          return response;
        },
      },
    });
    const result = stalled.result(
      { method: 'GET', pathTemplate: '/stalled', signal: abort.signal },
      StringSchema,
    );
    await ready;
    abort.abort(reason);
    await assert.rejects(result, (error) => error === reason);
  }

  const uploadStop = new RequestCancellationError('upload failed');
  const body = StreamingBody.bytes(async function* () {
    yield new Uint8Array(65536);
    throw uploadStop;
  });
  await assert.rejects(
    client.transportResponse({
      method: 'POST',
      pathTemplate: '/echo',
      body,
      contentTypes: [MediaType.OctetStream],
    }),
    (error) => error === uploadStop,
  );

  const stop = new RequestCancellationError('response stopped');
  const events = new FetchTransport(base, {
    logger: {},
    responseAdapter: {
      adapt() {
        throw stop;
      },
    },
  });
  const iterator = events
    .eventStream(
      { method: 'GET', pathTemplate: '/events' },
      (_codec, _event, _id, data) => data,
    )
    [Symbol.asyncIterator]();
  await assert.rejects(iterator.next(), (error) => error === stop);
  await iterator.return();
  console.log(
    'Native Fetch redirects, streaming uploads, cancellation, and stop identity passed',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
