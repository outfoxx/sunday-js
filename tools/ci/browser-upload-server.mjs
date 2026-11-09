// An independent HTTP/2 peer: browser streaming uploads are not supported over HTTP/1.1.
import { asyncExecutionRoute } from './async-execution-fixture.mjs';
import { createSecureServer } from 'node:http2';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];
const bundle = readFileSync(join(directory, 'runtime.js'));
const bodyChecks = readFileSync(
  new URL('./request-body-checks.mjs', import.meta.url),
);
const received = new Map();
const server = createSecureServer({
  key: readFileSync(join(directory, 'key.pem')),
  cert: readFileSync(join(directory, 'cert.pem')),
  allowHTTP1: true,
});
server.on('request', (request, response) => {
  request.on('error', () => {});
  response.on('error', () => {});
  const url = new URL(request.url, 'https://localhost');
  if (asyncExecutionRoute(request, response)) return;
  if (
    url.pathname === '/sse-framing-checks.js' ||
    url.pathname === '/sse-framing-fixtures.mjs'
  ) {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    const file =
      url.pathname === '/sse-framing-checks.js'
        ? './sse-framing-checks.mjs'
        : './sse-framing-fixtures.mjs';
    response.end(readFileSync(new URL(file, import.meta.url)));
  } else if (url.pathname === '/notification-checks.mjs') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(new URL('./notification-checks.mjs', import.meta.url)),
    );
  } else if (url.pathname === '/sse-control-checks.mjs') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(new URL('./sse-control-checks.mjs', import.meta.url)),
    );
  } else if (url.pathname === '/credential-boundary-checks.mjs') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(
        new URL('./credential-boundary-checks.mjs', import.meta.url),
      ),
    );
  } else if (url.pathname === '/lifecycle-checks.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(new URL('./lifecycle-checks.mjs', import.meta.url)),
    );
  } else if (url.pathname === '/body-ownership-checks.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(new URL('./body-ownership-checks.mjs', import.meta.url)),
    );
  } else if (url.pathname === '/async-execution-checks.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(
      readFileSync(new URL('./async-execution-checks.mjs', import.meta.url)),
    );
  } else if (url.pathname === '/request-body-checks.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(bodyChecks);
  } else if (url.pathname === '/runtime.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(bundle);
  } else if (url.pathname === '/echo') {
    const chunks = [];
    request.on('data', (chunk) => {
      chunks.push(chunk);
      received.set(url.searchParams.get('id'), true);
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(Buffer.concat(chunks).toString()));
    });
  } else if (url.pathname === '/progress') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(received.has(url.searchParams.get('id'))));
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Streaming request tests</title>');
  }
});
server.listen(0, '127.0.0.1', () => {
  console.log(`https://127.0.0.1:${server.address().port}`);
});
