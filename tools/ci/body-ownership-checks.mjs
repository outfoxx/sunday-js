// Run unchanged against real HTTP peers in browsers, Node, and Bun.
export async function checkBodyOwnership(
  s,
  base,
  progress = () => {},
  collectGarbage = async () => {},
) {
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
    progress(message);
  };
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const failure = (promise) =>
    promise.then(
      () => {
        throw new Error('Expected rejection');
      },
      (e) => e,
    );
  const errors = () => [
    new Error('application error'),
    new Error('outer source', {
      cause: new s.RequestCancellationError('inner source'),
    }),
    new TypeError('outer source type', {
      cause: new DOMException('inner abort', 'AbortError'),
    }),
    new TypeError('application type error'),
    new DOMException('application abort', 'AbortError'),
    new s.RequestCancellationError('application stop'),
    null,
    undefined,
  ];
  const broken = (error) =>
    new ReadableStream({
      start(c) {
        c.error(error);
      },
    });
  const events = (client, signal) =>
    client
      .eventStream(
        { method: 'GET', pathTemplate: '/fifo-events', signal },
        (_c, _e, _id, data) => data,
      )
      [Symbol.asyncIterator]();
  const perform = async (client, streaming, spec = {}) => {
    if (!streaming)
      return client.result(
        { method: 'GET', pathTemplate: '/echo', ...spec },
        s.StringSchema,
      );
    const iterator = client
      .eventStream(
        { method: 'GET', pathTemplate: '/fifo-events', ...spec },
        (_c, _e, _id, data) => data,
      )
      [Symbol.asyncIterator]();
    try {
      return (await iterator.next()).value;
    } finally {
      await iterator.return();
    }
  };

  // Failure provenance: an adapter may handle a source error and choose its own outcome.
  for (const source of errors()) {
    for (const intended of errors()) {
      const chain = new s.ResponseAdapters({
        async adapt(response) {
          check(
            (await failure(response.text())) === source,
            'adapter sees original body failure',
          );
          throw intended;
        },
      });
      check(
        (await failure(
          chain.adapt(new Response(broken(source)), new Request(base)),
        )) === intended,
        'adapter-selected error must never be replaced by a source error',
      );
    }
  }
  // An undefined source failure is an ordinary error, not the default AbortError from abort().
  {
    const observed = deferred();
    const client = new s.FetchTransport(base, {
      logger: {},
      responseAdapter: new s.ResponseAdapters(
        {
          async adapt(response) {
            await response.body?.cancel();
            return new Response(broken(undefined));
          },
        },
        {
          async adapt(response) {
            await response.text();
            return response;
          },
        },
      ),
    });
    const source = client.eventSource({ method: 'GET', pathTemplate: '/echo' });
    source.onerror = (event) => {
      observed.resolve({
        error: event.error,
        terminal: source.readyState === source.CLOSED,
      });
      source.close();
    };
    source.connect();
    const result = await observed.promise;
    check(
      result.error === undefined && !result.terminal,
      'undefined source error preserves SSE reconnection policy',
    );
  }
  // Copies that transfer the same stream retain body-reader behavior, without nested wrappers.
  for (const method of [
    'text',
    'json',
    'blob',
    'arrayBuffer',
    'formData',
    'bytes',
  ]) {
    if (typeof Response.prototype[method] !== 'function') continue;
    const source = new s.RequestCancellationError('bulk reader stop');
    const chain = new s.ResponseAdapters({
      async adapt(response) {
        const copy = s.copyResponse(response, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        check(copy.body === response.body, 'response copies share body');
        check(
          (await failure(copy[method]())) === source,
          `${method} restores source failure at native boundary`,
        );
        return new Response('replacement');
      },
    });
    check(
      (await (
        await chain.adapt(new Response(broken(source)), new Request(base))
      ).text()) === 'replacement',
      'handled source failure permits replacement',
    );
  }
  for (const streaming of [false, true]) {
    for (const intended of [
      new DOMException('stop', 'AbortError'),
      new s.RequestCancellationError('stop'),
    ]) {
      let attempts = 0;
      const client = new s.FetchTransport(base, {
        logger: {},
        requestAdapter: {
          adapt(r) {
            attempts++;
            return r;
          },
        },
        responseAdapter: new s.ResponseAdapters(
          {
            async adapt(r) {
              await r.body?.cancel();
              return new Response(broken(new Error('source')));
            },
          },
          {
            async adapt(r) {
              try {
                await r.text();
              } catch {}
              throw intended;
            },
          },
        ),
      });
      check(
        (await failure(perform(client, streaming))) === intended &&
          attempts === 1,
        'explicit stop never reconnects or changes identity',
      );
    }
  }

  // Native upload paths and buffering fallback must expose the same original source errors.
  for (const decoded of [false, true]) {
    for (const source of errors()) {
      for (const inAdapter of [false, true]) {
        const stream = () =>
          new ReadableStream({
            async pull(c) {
              c.enqueue(new Uint8Array([65]));
              await tick();
              c.error(source);
            },
          });
        const client = new s.FetchTransport(base, {
          logger: {},
          requestAdapter: inAdapter
            ? {
                async adapt(request) {
                  const body = await s.prepareRequestBody(stream(), {
                    signal: request.signal,
                  });
                  return s.copyRequest(request, { body, duplex: 'half' });
                },
              }
            : undefined,
        });
        const spec = {
          method: 'POST',
          pathTemplate: '/echo',
          contentTypes: [s.MediaType.OctetStream],
          ...(inAdapter ? {} : { body: s.StreamingBody.stream(stream) }),
        };
        check(
          (await failure(
            decoded
              ? client.result(spec, s.StringSchema)
              : client.transportResponse(spec),
          )) === source,
          `${decoded}/${inAdapter}: upload source failure identity`,
        );
      }
    }
  }

  // Stop the producer, not just the promise awaiting an adapter. Test both cleanup outcomes.
  for (const mode of ['export', 'buffered', 'streaming']) {
    for (const reason of [new Error('cancel read'), null]) {
      for (const pendingCleanup of [false, true]) {
        const abort = new AbortController(),
          ready = deferred();
        let cancelled = 0,
          received,
          source;
        const client = new s.FetchTransport(base, {
          logger: {},
          requestAdapter: {
            async adapt(request) {
              const body = await request.text();
              return s.copyRequest(request, { body });
            },
          },
        });
        const spec = {
          method: 'POST',
          pathTemplate: '/echo',
          signal: abort.signal,
          contentTypes: [s.MediaType.OctetStream],
          body: s.StreamingBody.stream(
            () =>
              (source = new ReadableStream({
                pull() {
                  ready.resolve();
                  return new Promise(() => {});
                },
                cancel(error) {
                  cancelled++;
                  received = error;
                  if (pendingCleanup) return new Promise(() => {});
                },
              })),
          ),
        };
        let pending;
        if (mode === 'export') pending = client.transportRequest(spec);
        else if (mode === 'buffered')
          pending = client.result(spec, s.StringSchema);
        else pending = perform(client, true, spec);
        const result = failure(pending);
        await ready.promise;
        await tick();
        abort.abort(reason);
        check(
          (await result) === reason,
          `${mode}: pending request-body reader abort identity`,
        );
        await tick();
        check(
          cancelled === 1 && received === reason && !source.locked,
          `${mode}: producer cancelled and reader released without awaiting cleanup`,
        );
      }
    }
  }

  // A native body retains its identity/capabilities through no-op and header-only adapters.
  const original = await fetch(base + '/echo');
  let nativeByob = false;
  try {
    const r = original.body.getReader({ mode: 'byob' });
    nativeByob = true;
    r.releaseLock();
  } catch {}
  await original.body.cancel();
  for (const copy of [false, true]) {
    let seen;
    const client = new s.FetchTransport(base, {
      logger: {},
      responseAdapter: {
        adapt(response) {
          seen = copy
            ? s.copyResponse(response, { headers: response.headers })
            : response;
          return seen;
        },
      },
    });
    const response = await client.transportResponse({
      method: 'GET',
      pathTemplate: '/echo',
    });
    check(
      response.body === seen.body && (copy || response === seen),
      'native body identity preserved',
    );
    let byob = false;
    try {
      const reader = response.body.getReader({ mode: 'byob' });
      byob = true;
      reader.releaseLock();
    } catch {}
    check(byob === nativeByob, 'native BYOB capability preserved');
    await response.body.cancel();
  }

  // Independent byte streams must retain BYOB reads, EOF, cancellation, and original failures.
  for (const ending of ['eof', 'failure', 'abort']) {
    const abort = new AbortController(),
      ready = deferred(),
      reason = new s.RequestCancellationError('byte source');
    let n = 0,
      cancelled = 0;
    const input = new Response(
      new ReadableStream({
        type: 'bytes',
        pull(c) {
          if (!n++) {
            c.enqueue(new Uint8Array([1, 2, 3]));
            return;
          }
          ready.resolve();
          if (ending === 'eof') {
            c.close();
            c.byobRequest?.respond(0);
          } else if (ending === 'failure') c.error(reason);
          else return new Promise(() => {});
        },
        cancel() {
          cancelled++;
        },
      }),
    );
    const response = await new s.ResponseAdapters({
      adapt(r) {
        return r;
      },
    }).adapt(input, new Request(base, { signal: abort.signal }));
    const reader = response.body.getReader({ mode: 'byob' });
    const first = await reader.read(new Uint8Array(8));
    check([...first.value].join() === '1,2,3', 'byte stream contents');
    const read = reader.read(new Uint8Array(8));
    const result = ending === 'eof' ? read : failure(read);
    if (ending === 'abort') {
      await ready.promise;
      abort.abort(reason);
    }
    if (ending === 'eof') check((await result).done, 'BYOB EOF settles');
    else check((await result) === reason, 'BYOB source/abort identity');
    reader.releaseLock();
    check(ending !== 'abort' || cancelled === 1, 'BYOB producer cancellation');
  }

  // Compare lock cleanup with the native engine: Bun currently leaves a cancelled BYOB
  // read pending, even though cancel() succeeds. Sunday must still settle its consumer.
  const nativeByteSource = new ReadableStream({ type: 'bytes' });
  const nativeByteReader = nativeByteSource.getReader({ mode: 'byob' });
  void nativeByteReader.read(new Uint8Array(8)).catch(() => {});
  await nativeByteReader.cancel();
  let nativeByteRelease = true;
  try {
    nativeByteReader.releaseLock();
  } catch {
    nativeByteRelease = false;
  }

  // Producers that only fill BYOB views must work with every kind of consumer. Partial writes,
  // offset views, and typed consumers exercise buffer transfer and alignment, not just capability.
  for (const consumer of ['byob', 'default', 'bulk']) {
    for (const ending of ['eof', 'empty', 'failure', 'abort', 'cancel']) {
      const abort = new AbortController(),
        ready = deferred();
      const reason = new s.RequestCancellationError('BYOB-only source');
      let position = 0,
        pulls = 0,
        cancelled = 0,
        cancellationReason;
      const source = new ReadableStream({
        type: 'bytes',
        pull(c) {
          pulls++;
          const request = c.byobRequest;
          if (!request) throw new Error('BYOB producer requires a view');
          if (ending !== 'empty' && position < 4) {
            request.view[0] = ++position;
            request.respond(1);
          } else {
            ready.resolve();
            if (ending === 'eof' || ending === 'empty') {
              c.close();
              request.respond(0);
            } else if (ending === 'failure') c.error(reason);
            else return new Promise(() => {});
          }
        },
        cancel(value) {
          cancelled++;
          cancellationReason = value;
          return new Promise(() => {});
        },
      });
      const response = await new s.ResponseAdapters({ adapt: (r) => r }).adapt(
        new Response(source),
        new Request(base, { signal: abort.signal }),
      );
      check(pulls === 0, 'byte ownership does not read ahead');
      // A bulk reader cannot be cancelled directly; its owner observes the caller's signal.
      if (consumer === 'bulk' && ending === 'cancel') {
        abort.abort(reason);
        check(
          (await failure(response.arrayBuffer())) === reason,
          'pre-read byte abort identity',
        );
        check(!source.locked, 'pre-read byte abort releases source');
        continue;
      }
      const reader =
        consumer === 'bulk'
          ? undefined
          : response.body.getReader(
              consumer === 'byob' ? { mode: 'byob' } : undefined,
            );
      const consume = async () => {
        if (!reader) return new Uint8Array(await response.arrayBuffer());
        const bytes = [];
        for (;;) {
          const result =
            consumer === 'byob'
              ? await reader.read(new Uint8Array(new ArrayBuffer(12), 2, 8))
              : await reader.read();
          if (result.value)
            bytes.push(
              ...new Uint8Array(
                result.value.buffer,
                result.value.byteOffset,
                result.value.byteLength,
              ),
            );
          if (result.done) return bytes;
        }
      };
      const operation = consume();
      const outcome = ['failure', 'abort'].includes(ending)
        ? failure(operation)
        : operation;
      if (ending === 'abort' || ending === 'cancel') {
        await ready.promise;
        if (ending === 'abort') abort.abort(reason);
        else void reader.cancel(reason);
      }
      // Bun's own BYOB cancellation does not settle an outstanding read. Explicit abort
      // above still must reject promptly; direct reader.cancel retains native behavior.
      if (ending === 'cancel' && consumer === 'byob' && !nativeByteRelease) {
        await reader.closed;
        check(
          cancelled === 1 && cancellationReason === reason,
          'native BYOB cancellation reaches source',
        );
        continue;
      }
      const result = await outcome;
      if (ending === 'abort' || ending === 'failure')
        check(result === reason, 'BYOB-only failure identity');
      else
        check(
          [...result].join() === (ending === 'empty' ? '' : '1,2,3,4'),
          'BYOB-only contents and EOF',
        );
      reader?.releaseLock();
      check(
        !source.locked ||
          (!nativeByteRelease && ['abort', 'cancel'].includes(ending)),
        'byte source reader release matches native capability',
      );
      check(
        cancelled === (['abort', 'cancel'].includes(ending) ? 1 : 0),
        'byte source cancellation count',
      );
      if (cancelled)
        check(cancellationReason === reason, 'byte source cancellation reason');
    }
  }

  // Typed BYOB views retain offset and alignment when a producer fills whole elements.
  {
    let written = false;
    const response = await new s.ResponseAdapters({ adapt: (r) => r }).adapt(
      new Response(
        new ReadableStream({
          type: 'bytes',
          pull(c) {
            if (written) {
              c.close();
              c.byobRequest.respond(0);
              return;
            }
            written = true;
            c.byobRequest.view.set([1, 2, 3, 4]);
            c.byobRequest.respond(4);
          },
        }),
      ),
      new Request(base),
    );
    const reader = response.body.getReader({ mode: 'byob' });
    const first = await reader.read(new Uint16Array(new ArrayBuffer(12), 2, 4));
    check(
      first.value instanceof Uint16Array &&
        first.value.byteOffset === 2 &&
        first.value.length === 2,
      'typed BYOB offset and alignment',
    );
    check((await reader.read(new Uint16Array(4))).done, 'typed BYOB EOF');
    reader.releaseLock();
  }

  // Exercise BYOB-only producers through native uploads and both transport consumers too.
  const byteBody = (text, error) => {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    return new ReadableStream({
      type: 'bytes',
      pull(c) {
        const request = c.byobRequest;
        if (offset < bytes.length) {
          const count = Math.min(
            request.view.byteLength,
            bytes.length - offset,
          );
          request.view.set(bytes.subarray(offset, offset + count));
          offset += count;
          request.respond(count);
        } else if (error) c.error(error);
        else {
          c.close();
          request.respond(0);
        }
      },
    });
  };
  for (const decoded of [false, true]) {
    const client = new s.FetchTransport(base, { logger: {} });
    const spec = {
      method: 'POST',
      pathTemplate: '/echo',
      contentTypes: [s.MediaType.OctetStream],
      body: s.StreamingBody.stream(() => byteBody('upload')),
    };
    const value = decoded
      ? await client.result(spec, s.StringSchema)
      : await (await client.transportResponse(spec)).json();
    check(value === 'upload', 'BYOB-only native or fallback upload');
  }
  for (const streaming of [false, true]) {
    for (const broken of [false, true]) {
      const reason = new s.RequestCancellationError('BYOB transport source');
      const client = new s.FetchTransport(base, {
        logger: {},
        responseAdapter: {
          async adapt(response) {
            await response.body?.cancel();
            return new Response(
              byteBody(
                broken ? '' : streaming ? 'data: ok\n\n' : '"ok"',
                broken ? reason : undefined,
              ),
              {
                headers: {
                  'Content-Type': streaming
                    ? 'text/event-stream'
                    : 'application/json',
                },
              },
            );
          },
        },
      });
      const result = broken
        ? await failure(perform(client, streaming))
        : await perform(client, streaming);
      check(
        result === (broken ? reason : 'ok'),
        'BYOB transport contents and source identity',
      );
    }
  }

  // Body selection must match native inheritance, including null on same-URL copies. Changing
  // the URL uses a URL constructor: null clears its body, while undefined preserves the input.
  for (const changeURL of [false, true]) {
    for (const choice of ['absent', 'undefined', 'null', 'replacement']) {
      const changes = {
        ...(changeURL ? { url: base + '/echo?copy' } : {}),
        ...(choice === 'absent'
          ? {}
          : {
              body:
                choice === 'null'
                  ? null
                  : choice === 'replacement'
                    ? 'new'
                    : undefined,
            }),
      };
      const original = new Request(base + '/echo', {
        method: 'POST',
        body: 'old',
      });
      // Firefox does not expose Request.body, so a synchronous URL-changing copy cannot
      // transfer its hidden source. Explicit replacements and same-URL inheritance still work.
      if (
        changeURL &&
        !original.body &&
        ['absent', 'undefined'].includes(choice)
      )
        continue;
      const copy = s.copyRequest(original, changes);
      const cleared = choice === 'null' && (changeURL || 'Bun' in globalThis);
      check(
        (await copy.text()) ===
          (cleared ? '' : choice === 'replacement' ? 'new' : 'old'),
        `copy effective body: ${changeURL}/${choice}`,
      );
      if (cleared || choice === 'replacement') await original.body?.cancel();
    }
  }
  // Real Fetch failures must retain the source error through a null-body copy. Bun clears that
  // body natively; verify its result instead. Firefox exercises the buffering fallback.
  for (const decoded of [false, true]) {
    const reason = new s.RequestCancellationError('null-copy source');
    let adapted = false,
      dropped = false;
    const client = new s.FetchTransport(base, {
      logger: {},
      requestAdapter: {
        adapt(request) {
          adapted = true;
          const copy = s.copyRequest(request, { body: null });
          dropped = !copy.body;
          if (dropped) void request.body?.cancel();
          return copy;
        },
      },
    });
    const spec = {
      method: 'POST',
      pathTemplate: '/echo',
      contentTypes: [s.MediaType.OctetStream],
      body: s.StreamingBody.stream(
        () =>
          new ReadableStream({
            async pull(c) {
              c.enqueue(new Uint8Array([65]));
              await tick();
              c.error(reason);
            },
          }),
      ),
    };
    const outcome = await (
      decoded
        ? client.result(spec, s.StringSchema)
        : client.transportResponse(spec)
    ).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    if (adapted && dropped) {
      check(!('error' in outcome), 'native bodyless copy succeeds');
      if (!decoded) await outcome.value.body?.cancel();
    } else check(outcome.error === reason, 'null-copy upload failure identity');
  }

  // Empty data is an event; absent data and decoder-selected undefined are not values.
  {
    const seen = [];
    const client = new s.FetchTransport(base, { logger: {} });
    const iterator = client
      .eventStream(
        { method: 'GET', pathTemplate: '/empty-events' },
        (_c, _e, id, data) => {
          seen.push([id, data]);
          return data === 'skip' ? undefined : data;
        },
      )
      [Symbol.asyncIterator]();
    try {
      for (const expected of ['', '', 'tail'])
        check(
          (await iterator.next()).value === expected,
          'empty wire SSE payload retained',
        );
      check(
        JSON.stringify(seen) ===
          JSON.stringify([
            ['kept', ''],
            ['kept', ''],
            ['kept', 'skip'],
            ['kept', 'tail'],
          ]),
        'SSE controls and skipped values',
      );
    } finally {
      await iterator.return();
    }
  }

  // The iterator contract skips only undefined, not valid falsy decoded values.
  {
    const values = [0, false, ''];
    const client = new s.FetchTransport(base, {
      logger: {},
      responseAdapter: {
        async adapt(r) {
          await r.body?.cancel();
          return new Response('data: 0\n\ndata: false\n\ndata: ""\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        },
      },
    });
    const iterator = client
      .eventStream(
        { method: 'GET', pathTemplate: '/fifo-events' },
        (_c, _e, _id, data) => JSON.parse(data),
      )
      [Symbol.asyncIterator]();
    try {
      for (const value of values)
        check(
          (await iterator.next()).value === value,
          'falsy SSE data retained',
        );
    } finally {
      await iterator.return();
    }
  }
  // A Fetch failure may cancel an upload. That cleanup is not a new source failure.
  if (s.supportsStreamingUploads()) {
    const cleanupError = new s.RequestCancellationError(
      'cleanup must not replace network failure',
    );
    const cancelled = deferred();
    const client = new s.FetchTransport(base, { logger: {} });
    const nativeFetch = globalThis.fetch;
    let nativeFailure;
    globalThis.fetch = (...args) =>
      nativeFetch(...args).catch((error) => {
        nativeFailure = error;
        throw error;
      });
    try {
      const error = await failure(
        client.transportResponse({
          method: 'POST',
          pathTemplate: '/disconnect',
          contentTypes: [s.MediaType.OctetStream],
          body: s.StreamingBody.stream(
            () =>
              new ReadableStream({
                start(c) {
                  c.enqueue(new Uint8Array([1]));
                },
                pull() {
                  return new Promise(() => {});
                },
                cancel() {
                  cancelled.resolve();
                  throw cleanupError;
                },
              }),
          ),
        }),
      );
      check(
        error === nativeFailure &&
          error !== cleanupError &&
          error !== undefined,
        'native Fetch error survives upload cleanup',
      );
    } finally {
      globalThis.fetch = nativeFetch;
    }
    await cancelled.promise;
    check(true, 'failed Fetch stops upload producer');
  }

  // Pre-aborted preparation must reject as well as dispose its newly-owned stream.
  for (const reason of [new Error('pre-aborted'), null]) {
    const abort = new AbortController();
    abort.abort(reason);
    let cancelled = 0,
      received;
    const source = new ReadableStream({
      cancel(error) {
        cancelled++;
        received = error;
      },
    });
    check(
      (await failure(
        s.prepareRequestBody(source, { signal: abort.signal }),
      )) === reason,
      'pre-aborted preparation rejects with original reason',
    );
    check(
      cancelled === 1 && received === reason && !source.locked,
      'pre-aborted preparation cancels source',
    );
  }
  // Raw native Requests bypass preparation: ownership must already exist at the entry check.
  for (const reason of [
    new s.RequestCancellationError('raw pre-abort'),
    new Error('raw abort'),
    null,
  ]) {
    for (const cleanup of ['resolve', 'throw', 'reject', 'pending']) {
      const abort = new AbortController();
      let cancelled = 0,
        received,
        adaptations = 0;
      const streaming = s.supportsStreamingUploads();
      const request = new Request(base + '/echo', {
        method: 'POST',
        signal: abort.signal,
        duplex: 'half',
        body: streaming
          ? new ReadableStream({
              pull() {
                return new Promise(() => {});
              },
              cancel(error) {
                cancelled++;
                received = error;
                if (cleanup === 'throw') throw new Error('cleanup');
                if (cleanup === 'reject')
                  return Promise.reject(new Error('cleanup'));
                if (cleanup === 'pending') return new Promise(() => {});
              },
            })
          : new Blob(['buffered']),
      });
      abort.abort(reason);
      const client = new s.FetchTransport(base, {
        logger: {},
        requestAdapter: {
          adapt(value) {
            adaptations++;
            return value;
          },
        },
      });
      check(
        (await failure(client.transportResponse(request))) === reason,
        'raw request retains original pre-abort reason',
      );
      await tick();
      check(
        adaptations === 0,
        'pre-aborted raw request never reaches adapters',
      );
      if (streaming)
        check(
          cancelled === 1 && received === reason,
          'pre-aborted raw upload is cancelled exactly once without awaiting cleanup',
        );
      else if (request.body)
        check(
          request.bodyUsed,
          'pre-aborted buffered body is discarded where exposed',
        );
    }
  }

  // A native copy may create an unused tee branch even when the upload succeeds. Retire
  // it during transfer; keeping it until failure retains every chunk for the old request.
  for (const managed of [false, true]) {
    const streaming = s.supportsStreamingUploads();
    const chunkSize = 64 * 1024,
      chunkCount = 128;
    let chunks = 0,
      cancelled = 0;
    const source =
      managed || streaming
        ? new ReadableStream(
            {
              pull(controller) {
                if (chunks++ < chunkCount)
                  controller.enqueue(new Uint8Array(chunkSize));
                else controller.close();
              },
              cancel() {
                cancelled++;
              },
            },
            { highWaterMark: 0 },
          )
        : undefined;
    const body = managed
      ? await s.prepareRequestBody(source)
      : streaming
        ? source
        : new Blob([new Uint8Array(chunkSize * chunkCount)]);
    let request = new Request(base + '/upload-size', {
      method: 'POST',
      body,
      duplex: 'half',
    });
    const inputs = [];
    const transferred = (input, output) => {
      // Firefox hides buffered Request bodies; successful transfer is checked by the peer.
      if (input.body && input.body !== output?.body)
        check(
          input.bodyUsed || input.body.locked,
          `${managed ? 'managed' : 'raw'}: obsolete input cannot buffer upload data`,
        );
    };
    for (let copy = 0; copy < 3; copy++) {
      inputs.push(request);
      request = s.copyRequest(request);
      transferred(inputs.at(-1), request);
    }
    inputs.push(request);
    const client = new s.FetchTransport(base, { logger: {} });
    progress(`${managed ? 'managed' : 'raw'}: successful upload started`);
    const response = await client.transportResponse(request);
    check(
      (await response.json()) === chunkSize * chunkCount,
      'successful transfer delivers the complete upload',
    );
    for (const input of inputs) transferred(input);
    check(
      cancelled === 0,
      'retiring unused native branches does not cancel the active producer',
    );
  }

  // Record native cancellation forwarding separately from Sunday's caller-error contract.
  // Chromium drops the reason through Request transfers; Bun uses tee cancellation arrays.
  const nativeStop = new Error('native transfer cancellation');
  let nativeCancellation;
  if (s.supportsStreamingUploads()) {
    const original = new Request(base, {
      method: 'POST',
      duplex: 'half',
      body: new ReadableStream({
        cancel(reason) {
          nativeCancellation = reason;
        },
      }),
    });
    const copy = new Request(original);
    if (!original.body.locked) void original.body.cancel().catch(() => {});
    if (!copy.body.locked) void copy.body.cancel(nativeStop).catch(() => {});
    await tick();
  }
  const nativeLeaves = (reason) =>
    Array.isArray(reason) ? reason.flatMap(nativeLeaves) : [reason];

  // Exercise native and managed bodies through the same transfer/failure boundaries.
  // Firefox uses the supported Blob fallback; it cannot represent a raw upload stream.
  for (const managed of [false, true]) {
    for (const boundary of ['chain', 'transport', 'events']) {
      for (const outcome of [
        'header-name',
        'header-value',
        'stop',
        'abort',
        'read-stop',
        'read-abort',
      ]) {
        if (boundary === 'events' && outcome.startsWith('header')) continue;
        for (const cleanup of ['resolve', 'throw', 'reject', 'pending']) {
          const streaming = s.supportsStreamingUploads();
          const abort = new AbortController();
          const stop = new s.RequestCancellationError('after transfer');
          let cancelled = 0,
            received,
            intended,
            attempts = 0,
            reading;
          const source =
            managed || streaming
              ? new ReadableStream({
                  pull(controller) {
                    if (!streaming) {
                      controller.enqueue(new Uint8Array([1, 2, 3]));
                      controller.close();
                    }
                  },
                  cancel(reason) {
                    cancelled++;
                    received = reason;
                    if (cleanup === 'throw') throw new Error('cleanup');
                    if (cleanup === 'reject')
                      return Promise.reject(new Error('cleanup'));
                    if (cleanup === 'pending') return new Promise(() => {});
                  },
                })
              : undefined;
          const body = managed
            ? await s.prepareRequestBody(source, { signal: abort.signal })
            : streaming
              ? source
              : new Blob(['raw']);
          const original = new Request(base + '/echo', {
            method: 'POST',
            body,
            duplex: 'half',
            signal: abort.signal,
          });
          const token = new s.StaticHeaderTokenAuthorizingAdapter(
            outcome === 'header-value' ? 'bad\ntoken' : 'token',
          );
          if (outcome === 'header-name') token.header = 'Invalid Header';
          const adapter = new s.RequestAdapters(
            { adapt: (request) => s.copyRequest(s.copyRequest(request)) },
            {
              async adapt(request) {
                attempts++;
                if (outcome.startsWith('read-')) {
                  reading = request.text().then(
                    (value) => ({ value }),
                    (error) => ({ error }),
                  );
                  await tick();
                  // Native stream wrappers must remain identifiable while their readers are active.
                  if (
                    !managed &&
                    outcome === 'read-stop' &&
                    cleanup === 'throw'
                  )
                    await collectGarbage();
                }
                if (outcome.endsWith('abort')) {
                  intended = stop;
                  abort.abort(stop);
                  return new Promise(() => {});
                }
                try {
                  if (outcome.endsWith('stop')) throw stop;
                  return await token.adapt(request);
                } catch (error) {
                  intended = error;
                  throw error;
                }
              },
            },
          );
          const client = new s.FetchTransport(base, {
            logger: {},
            requestAdapter:
              boundary === 'events'
                ? new s.RequestAdapters({ adapt: () => original }, adapter)
                : adapter,
          });
          const caught = await failure(
            boundary === 'chain'
              ? adapter.adapt(original)
              : boundary === 'events'
                ? perform(client, true)
                : client.transportResponse(original),
          );
          const label = `${managed ? 'managed' : 'raw'}/${boundary}/${outcome}/${cleanup}`;
          check(
            caught === intended && attempts === 1,
            `${label}: original failure, no retry`,
          );
          check(
            outcome.startsWith('header')
              ? caught instanceof TypeError
              : caught === stop,
            `${label}: expected failure`,
          );
          await tick();
          if (reading) {
            const result = await reading;
            check(
              streaming
                ? result.error === stop
                : typeof result.value === 'string',
              `${label}: pending bulk read stops with the original error; fallback remains readable`,
            );
          }
          if (streaming) {
            check(cancelled === 1, `${label}: producer cancelled exactly once`);
            const expected = nativeLeaves(nativeCancellation).map((reason) =>
              reason === nativeStop ? caught : reason,
            );
            check(
              managed
                ? received === caught
                : nativeLeaves(received).every((reason) =>
                    expected.includes(reason),
                  ),
              `${label}: native raw cancellation semantics and exact managed identity`,
            );
          } else if (original.body) {
            check(original.bodyUsed, `${label}: buffered fallback discarded`);
          }
        }
      }
    }
  }

  // A failed operation must also cancel a detached read begun by its adapter.
  if (s.supportsStreamingUploads()) {
    const ready = deferred(),
      stop = new s.RequestCancellationError('adapter stopped');
    let cancelled = 0,
      received,
      reading;
    const source = new ReadableStream({
      pull() {
        ready.resolve();
        return new Promise(() => {});
      },
      cancel(reason) {
        cancelled++;
        received = reason;
      },
    });
    const request = new Request(base, {
      method: 'POST',
      body: source,
      duplex: 'half',
    });
    const chain = new s.RequestAdapters({
      async adapt(r) {
        reading = failure(r.text());
        await ready.promise;
        throw stop;
      },
    });
    check(
      (await failure(chain.adapt(request))) === stop,
      'request adapter stop identity',
    );
    check(
      (await reading) === stop &&
        cancelled === 1 &&
        received === stop &&
        !source.locked,
      'adapter failure cancels detached native request reader',
    );
  }
  for (const mode of ['export', 'buffered', 'streaming']) {
    for (const stop of [
      new s.RequestCancellationError('validation stopped'),
      new DOMException('validation aborted', 'AbortError'),
    ]) {
      const client = new s.FetchTransport(base, { logger: {} });
      const spec = {
        method: 'GET',
        pathTemplate: '/echo',
        parameterValidation() {
          throw stop;
        },
      };
      const pending =
        mode === 'export'
          ? client.transportRequest(spec)
          : perform(client, mode === 'streaming', spec);
      check(
        (await failure(pending)) === stop,
        `${mode}: validation must not wrap stop errors`,
      );
    }
  }
  // Late adapter results still belong to the cancelled operation.
  {
    const abort = new AbortController(),
      entered = deferred(),
      late = deferred(),
      cancelled = deferred(),
      reason = new Error('late result abort');
    const client = new s.FetchTransport(base, {
      logger: {},
      responseAdapter: {
        async adapt(r) {
          await r.body?.cancel();
          entered.resolve();
          return late.promise;
        },
      },
    });
    const pending = failure(perform(client, false, { signal: abort.signal }));
    await entered.promise;
    abort.abort(reason);
    check((await pending) === reason, 'late adapter cancellation identity');
    late.resolve(
      new Response(
        new ReadableStream({
          cancel(error) {
            cancelled.resolve(error);
          },
        }),
      ),
    );
    check(
      (await cancelled.promise) === reason,
      'late resource cleanup receives original abort reason',
    );
  }
  // Native consumers must keep their own already-used/locked-body errors.
  {
    const source = new s.RequestCancellationError('source stopped');
    const response = await new s.ResponseAdapters({
      adapt(r) {
        return r;
      },
    }).adapt(new Response(broken(source)), new Request(base));
    check(
      (await failure(response.text())) === source,
      'first read restores the source failure',
    );
    const used = await failure(response.text());
    check(
      used instanceof TypeError && used !== source,
      'second read preserves native body-used failure',
    );
  }
  // Validation must happen before invoking an upload factory or buffering an invalid request.
  {
    let created = 0;
    const client = new s.FetchTransport(base, { logger: {} });
    const error = await failure(
      client.transportRequest({
        method: 'GET',
        pathTemplate: '/echo',
        body: s.StreamingBody.stream(() => {
          created++;
          return new ReadableStream();
        }),
        contentTypes: [s.MediaType.OctetStream],
      }),
    );
    check(
      error instanceof TypeError && created === 0,
      'invalid GET upload is rejected before allocating a source',
    );
  }

  return checks;
}
