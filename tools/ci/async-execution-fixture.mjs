import { framingCases } from './sse-framing-fixtures.mjs';

// Shared real-socket routes for browser HTTP/2 and Node/Bun HTTP/1 regression peers.
export function asyncExecutionRoute(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  if (path === '/upload-size') {
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
    });
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(size));
    });
  } else if (path === '/sse-retry-line') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end('retry: 100\n');
  } else if (path === '/sse-activity') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const partial = url.searchParams.get('kind') === 'partial';
    response.write(partial ? 'data: ' : ': ping\n');
    let count = 0;
    const timer = setInterval(() => {
      if (++count < 18) response.write(partial ? 'x' : ': ping\n');
      else {
        clearInterval(timer);
        response.write(partial ? 'done\n\n' : 'data: done\n\n');
      }
    }, 20);
    response.on('close', () => clearInterval(timer));
  } else if (path === '/credential-redirect') {
    response.writeHead(307, { Location: '/credential-events' });
    response.end();
  } else if (path === '/credential-events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(`data: ${request.headers.authorization ?? 'none'}\n\n`);
  } else if (path === '/unicode-events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const id = url.searchParams.get('id');
    const header = request.headers['last-event-id'];
    if (header) {
      response.write(
        `data: ${Buffer.from(header, 'latin1').toString('utf8')}\n\n`,
      );
    } else response.end(`retry: 0\nid: ${id}\ndata: initial\n\n`);
  } else if (path === '/sse-framing') {
    const fixture = framingCases[Number(url.searchParams.get('case'))];
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const bytes = Buffer.concat([
      fixture.bytes,
      Buffer.from('event: test-done\ndata: done\n\n'),
    ]);
    if (url.searchParams.get('chunked') !== 'true') response.write(bytes);
    else {
      let offset = 0;
      const write = () => {
        if (response.destroyed || offset === bytes.length) return;
        response.write(bytes.subarray(offset, ++offset));
        setImmediate(write);
      };
      write();
    }
  } else if (path === '/lifecycle-events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (request.headers['last-event-id']) {
      response.write(
        `data: ${request.headers['last-event-id'] === 'kept' ? 'fresh' : 'wrong-id'}\n\n`,
      );
    } else {
      response.write('retry: 1\nid: kept\ndata: initial\n\n');
      if (url.searchParams.get('ending') === 'batch') {
        response.write('id: poison\ndata: stale\n\n');
      } else {
        response.write(
          url.searchParams.get('partial') === 'utf8'
            ? Buffer.from([100, 97, 116, 97, 58, 32, 0xf0, 0x9f])
            : 'data: stale',
        );
        if (url.searchParams.get('ending') === 'reset') {
          setTimeout(() => {
            if (request.stream) request.stream.close(2);
            else request.socket.destroy();
          }, 20);
        } else response.end();
      }
    }
  } else if (path === '/lifecycle-batch') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('id: first\ndata: one\n\nid: poison\ndata: two\n\n');
  } else if (path === '/disconnect') {
    if (request.stream) request.stream.close(2);
    else request.socket.destroy();
  } else if (path === '/stalled') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
  } else if (path === '/empty-events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(
      ': comment\n\nid: kept\n\nevent: message\n\nretry: 2000\n\ndata:\n\ndata: \n\ndata: skip\n\ndata: tail\n\n',
    );
  } else if (path === '/fifo-events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: one\n\ndata: two\n\n');
  } else if (path === '/auth' || path === '/auth-events') {
    request.resume();
    if (request.headers.authorization !== 'Bearer new') {
      response.writeHead(401, {
        'WWW-Authenticate': 'Bearer error="invalid_token"',
      });
      response.end();
    } else {
      response.writeHead(200, {
        'Content-Type':
          path === '/auth-events' ? 'text/event-stream' : 'application/json',
      });
      response.end(path === '/auth-events' ? 'data: ok\n\n' : '"ok"');
    }
  } else return false;
  return true;
}
