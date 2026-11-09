import { framingCases } from './sse-framing-fixtures.mjs';

// The same parser and transport contracts run in browsers, Node, and Bun.
export async function checkSSEFraming(
  s,
  EventParser,
  base,
  compareNative = false,
) {
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const equal = (actual, expected, message) =>
    check(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
    );
  const encode = (text) => new TextEncoder().encode(text);
  for (const fixture of framingCases) {
    const parse = (chunks) => {
      const controls = [],
        parser = new EventParser((control) => controls.push(control)),
        events = [];
      for (const chunk of chunks)
        parser.process(chunk, (event) => events.push(event));
      equal(controls, fixture.controls ?? [], `${fixture.name}: controls`);
      return events;
    };
    equal(parse([fixture.bytes]), fixture.events, fixture.name);
    for (let split = 0; split <= fixture.bytes.length; split++) {
      equal(
        parse([
          fixture.bytes.slice(0, split).buffer,
          new ArrayBuffer(0),
          fixture.bytes.slice(split).buffer,
        ]),
        fixture.events,
        `${fixture.name}: split ${split}`,
      );
    }
    equal(
      parse(Array.from(fixture.bytes, (byte) => new Uint8Array([byte]))),
      fixture.events,
      `${fixture.name}: one-byte chunks`,
    );
    const padded = new Uint8Array(fixture.bytes.length + 8).fill(88);
    padded.set(fixture.bytes, 3);
    equal(
      parse([padded.subarray(3, 3 + fixture.bytes.length)]),
      fixture.events,
      `${fixture.name}: offset Uint8Array`,
    );
    equal(
      parse([new DataView(padded.buffer, 3, fixture.bytes.length)]),
      fixture.events,
      `${fixture.name}: offset DataView`,
    );
  }
  // Larger partial lines and multiline events exercise accumulation without reassembling bytes.
  {
    const content = 'é🚀'.repeat(8192),
      bytes = encode(`data: ${content}\n\n`);
    const parser = new EventParser(),
      events = [];
    for (let offset = 0; offset < bytes.length; offset += 127)
      parser.process(bytes.subarray(offset, offset + 127), (event) =>
        events.push(event),
      );
    equal(events, [{ data: content }], 'long line in many partial chunks');
    const lines = Array.from({ length: 256 }, (_, index) => String(index));
    parser.process(
      encode(lines.map((line) => `data: ${line}\r\n`).join('') + '\r\n'),
      (event) => events.push(event),
    );
    check(
      events[1].data === lines.join('\n'),
      'multiline data preserves all lines',
    );
  }
  // Stop the batch and discard both textual and UTF-8 tails. The original thrown value survives.
  for (const reason of [
    new s.RequestCancellationError('parser stop'),
    new Error('callback error'),
    null,
  ]) {
    const parser = new EventParser(),
      seen = [];
    let caught,
      threw = false;
    try {
      parser.process(encode('data: one\n\ndata: two\n\n'), (event) => {
        seen.push(event);
        throw reason;
      });
    } catch (error) {
      threw = true;
      caught = error;
    }
    check(
      threw && caught === reason && seen.length === 1,
      'dispatcher error identity and no subsequent callbacks',
    );
  }
  for (const ending of ['\n\n', '\r\r', '\r\n\r\n']) {
    const abort = new AbortController(),
      parser = new EventParser(),
      events = [];
    parser.process(
      new Uint8Array([
        ...encode(`data: first${ending}data: ignored\n\ndata: `),
        0xe2,
      ]),
      (event) => {
        events.push(event);
        abort.abort();
      },
      abort.signal,
    );
    parser.process(encode('\ufeffdata: fresh\n\n'), (event) =>
      events.push(event),
    );
    equal(
      events,
      [{ data: 'first' }, { data: 'fresh' }],
      'abort discards decoded and partial UTF-8 tails',
    );
  }
  {
    const parser = new EventParser(),
      events = [];
    parser.process(encode('data: partial'), (event) => events.push(event));
    parser.process(
      encode('ignored\n\n'),
      (event) => events.push(event),
      AbortSignal.abort(),
    );
    parser.process(encode('data: fresh\n\n'), (event) => events.push(event));
    equal(
      events,
      [{ data: 'fresh' }],
      'abort between chunks discards partial line',
    );
  }

  // Control callbacks share message callbacks' stop semantics within a chunk.
  for (const reason of [
    new s.RequestCancellationError('control stop'),
    new Error('control error'),
    null,
  ]) {
    for (const aborting of [false, true]) {
      const abort = new AbortController(),
        controls = [],
        events = [];
      const parser = new EventParser((control) => {
        controls.push(control);
        if (aborting) abort.abort(reason);
        else throw reason;
      });
      let caught,
        threw = false;
      try {
        parser.process(
          encode('retry: 1\nretry: 2\ndata: ignored\n\n'),
          (event) => events.push(event),
          abort.signal,
        );
      } catch (error) {
        threw = true;
        caught = error;
      }
      equal(controls, [{ retry: '1' }], 'control stop prevents later controls');
      equal(events, [], 'control stop prevents message dispatch');
      check(
        aborting
          ? abort.signal.reason === reason && !threw
          : threw && caught === reason,
        'control error identity',
      );
    }
  }

  const receive = (url, native) =>
    new Promise((resolve, reject) => {
      const source = native
        ? new EventSource(url)
        : new s.FetchEventSource(url, { logger: {} });
      const events = [];
      const finish = (error) => {
        clearTimeout(timer);
        source.close();
        if (error) reject(error);
        else resolve(events);
      };
      const timer = setTimeout(
        () => finish(new Error('SSE framing timed out: ' + url)),
        3000,
      );
      source.onmessage = (event) => {
        if (event.type === 'message')
          events.push({ data: event.data, id: event.lastEventId });
      };
      source.addEventListener('test-done', () => finish());
      source.onerror = (event) =>
        finish(event.error ?? new Error('Unexpected SSE connection failure'));
      if (!native) source.connect();
    });
  for (let index = 0; index < framingCases.length; index++) {
    const fixture = framingCases[index];
    if (fixture.incomplete) continue; // EOF truncation is checked directly; the wire fixture appends a completion event.
    let lastID = '';
    const expected = fixture.events.flatMap((event) => {
      if (event.id !== undefined) lastID = event.id;
      return event.data === undefined ? [] : [{ data: event.data, id: lastID }];
    });
    for (const chunked of [false, true]) {
      const url = `${base}/sse-framing?case=${index}&chunked=${chunked}`;
      const sunday = await receive(url, false);
      equal(sunday, expected, `${fixture.name}: real socket ${chunked}`);
      if (compareNative) {
        const native = await receive(url, true);
        equal(
          fixture.nativePayloadOnly
            ? sunday.map((event) => event.data)
            : sunday,
          fixture.nativePayloadOnly
            ? native.map((event) => event.data)
            : native,
          `${fixture.name}: native EventSource parity ${chunked}`,
        );
      }
    }
  }
  // A byte sequence buffered by the parser must not turn a source failure into a text event,
  // swallow a stop marker, or delay cancellation while waiting for the character to complete.
  for (const aborting of [false, true]) {
    const reason = new s.RequestCancellationError('mid-character stop');
    const abort = new AbortController();
    let ready;
    const started = new Promise((resolve) => {
      ready = resolve;
    });
    let cancelledWith,
      seen = 0;
    const client = new s.FetchTransport(base, {
      logger: {},
      responseAdapter: {
        async adapt(response) {
          await response.body?.cancel();
          let emitted = false;
          return new Response(
            new ReadableStream({
              pull(controller) {
                if (!emitted) {
                  emitted = true;
                  controller.enqueue(
                    new Uint8Array([...encode('data: '), 0xf0, 0x9f]),
                  );
                  return;
                }
                ready();
                if (!aborting) controller.error(reason);
                else return new Promise(() => {});
              },
              cancel(value) {
                cancelledWith = value;
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        },
      },
    });
    const iterator = client
      .eventStream(
        { method: 'GET', pathTemplate: '/fifo-events', signal: abort.signal },
        () => {
          seen++;
        },
      )
      [Symbol.asyncIterator]();
    try {
      const pending = iterator.next().then(
        () => {
          throw new Error('Expected stop');
        },
        (error) => error,
      );
      await started;
      if (aborting) abort.abort(reason);
      check(
        (await pending) === reason && seen === 0,
        'mid-character stop preserves identity without dispatch',
      );
      if (aborting)
        check(cancelledWith === reason, 'mid-character abort reaches producer');
    } finally {
      await iterator.return();
    }
  }
  return checks;
}
