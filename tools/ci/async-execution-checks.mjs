// Portable regression contracts, run unchanged in Chromium, Firefox, WebKit, Node, and Bun.
export async function checkAsyncExecution(sunday, base) {
  const {
    FetchTransport,
    StringSchema,
    RequestCancellationError,
    ResponseAdapters,
    RefreshingHeaderTokenAuthorizingAdapter,
    TokenManager,
  } = sunday;
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const failure = (promise) =>
    promise.then(
      () => {
        throw new Error('Expected rejection');
      },
      (error) => error,
    );
  const binding = {
    scheme: 'auth',
    provider: 'application',
    flow: 'external',
    scopes: [],
    transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
  };
  const provider = (acquire) => ({
    identity: 'application',
    configure: () => ({ clientIdentity: 'application' }),
    acquire,
  });
  const iterator = (
    client,
    spec,
    decode = (_codec, _event, _id, data) => data,
  ) =>
    client
      .eventStream(
        { method: 'GET', pathTemplate: '/fifo-events', ...spec },
        decode,
      )
      [Symbol.asyncIterator]();
  const perform = async (client, mode, spec = {}) => {
    spec = { method: 'GET', pathTemplate: '/echo', ...spec };
    if (mode === 'export') return client.transportRequest(spec);
    if (mode === 'buffered') return client.result(spec, StringSchema);
    const events = iterator(client, spec);
    try {
      return (await events.next()).value;
    } finally {
      await events.return();
    }
  };

  // A replacement stream is independent of Fetch's signal. Cancellation must reach it
  // while native decoding/validation (or a later adapter) owns its reader.
  for (const mode of ['buffered', 'streaming']) {
    for (const phase of ['body', 'validation', 'adapter']) {
      for (const reason of [
        new RequestCancellationError('cancel replacement'),
        null,
      ]) {
        const abort = new AbortController(),
          ready = deferred(),
          cancelled = deferred();
        let source,
          count = 0;
        const replacement = {
          async adapt(response) {
            await response.body?.cancel();
            source = new ReadableStream({
              pull() {
                ready.resolve();
                return new Promise(() => {});
              },
              cancel(cause) {
                count++;
                cancelled.resolve(cause);
              },
            });
            return new Response(source, {
              status: phase === 'validation' ? 400 : 200,
              headers: {
                'Content-Type':
                  mode === 'streaming' && phase === 'body'
                    ? 'text/event-stream'
                    : 'application/json',
              },
            });
          },
        };
        const client = new FetchTransport(base, {
          logger: {},
          responseAdapter: new ResponseAdapters(
            replacement,
            ...(phase === 'adapter'
              ? [
                  {
                    async adapt(response) {
                      await response.text();
                      return response;
                    },
                  },
                ]
              : []),
          ),
        });
        const result = failure(perform(client, mode, { signal: abort.signal }));
        await ready.promise;
        await tick();
        abort.abort(reason);
        check(
          (await result) === reason,
          `${mode}/${phase}: original abort identity`,
        );
        check(
          (await cancelled.promise) === reason,
          `${mode}/${phase}: replacement cancellation reason`,
        );
        await tick();
        check(
          count === 1 && !source.locked,
          `${mode}/${phase}: replacement reader released once`,
        );
      }
    }
    // Cleanup implementations may reject or never settle; neither may hold up cancellation.
    for (const cleanup of ['reject', 'pending']) {
      const abort = new AbortController(),
        ready = deferred(),
        cancelled = deferred();
      const reason = new Error('caller stopped');
      const client = new FetchTransport(base, {
        logger: {},
        responseAdapter: {
          async adapt(response) {
            await response.body?.cancel();
            return new Response(
              new ReadableStream({
                pull() {
                  ready.resolve();
                  return new Promise(() => {});
                },
                cancel(cause) {
                  cancelled.resolve(cause);
                  return cleanup === 'reject'
                    ? Promise.reject(new Error('cleanup failed'))
                    : new Promise(() => {});
                },
              }),
              {
                headers: {
                  'Content-Type':
                    mode === 'streaming'
                      ? 'text/event-stream'
                      : 'application/json',
                },
              },
            );
          },
        },
      });
      const result = failure(perform(client, mode, { signal: abort.signal }));
      await ready.promise;
      await tick();
      abort.abort(reason);
      check(
        (await result) === reason,
        `${mode}/${cleanup}: cleanup cannot replace abort`,
      );
      check(
        (await cancelled.promise) === reason,
        `${mode}/${cleanup}: cleanup receives reason`,
      );
    }
    const stop = new RequestCancellationError('adapter stopped'),
      cancelled = deferred();
    const client = new FetchTransport(base, {
      logger: {},
      responseAdapter: new ResponseAdapters(
        {
          async adapt(response) {
            await response.body?.cancel();
            return new Response(
              new ReadableStream({
                cancel(reason) {
                  cancelled.resolve(reason);
                },
              }),
            );
          },
        },
        {
          adapt() {
            throw stop;
          },
        },
      ),
    });
    check(
      (await failure(perform(client, mode))) === stop,
      `${mode}: later adapter stop identity`,
    );
    check(
      (await cancelled.promise) === stop,
      `${mode}: later adapter stops preceding body`,
    );

    for (const phase of ['body', 'validation', 'problem', 'adapter']) {
      const bodyStop = new RequestCancellationError('body stopped');
      const broken = new FetchTransport(base, {
        logger: {},
        responseAdapter: new ResponseAdapters(
          {
            async adapt(response) {
              await response.body?.cancel();
              return new Response(
                new ReadableStream({
                  start(controller) {
                    controller.error(bodyStop);
                  },
                }),
                {
                  status: ['validation', 'problem'].includes(phase) ? 400 : 200,
                  headers: {
                    'Content-Type':
                      phase === 'problem'
                        ? 'application/problem+json'
                        : mode === 'streaming' && phase === 'body'
                          ? 'text/event-stream'
                          : 'application/json',
                  },
                },
              );
            },
          },
          {
            async adapt(response) {
              if (phase === 'adapter') await response.text();
              return sunday.copyResponse(response, {
                headers: response.headers,
              });
            },
          },
        ),
      });
      check(
        (await failure(perform(broken, mode))) === bodyStop,
        `${mode}/${phase}: source stop identity through bulk decoding and response copies`,
      );
    }
    for (const replacement of [
      ...(mode === 'buffered'
        ? [new Error('adapter chose another failure')]
        : []),
      new RequestCancellationError('adapter stopped'),
    ]) {
      const client = new FetchTransport(base, {
        logger: {},
        responseAdapter: new ResponseAdapters(
          {
            async adapt(response) {
              await response.body?.cancel();
              return new Response(
                new ReadableStream({
                  start(controller) {
                    controller.error(new Error('source failed'));
                  },
                }),
              );
            },
          },
          {
            async adapt(response) {
              try {
                await response.text();
              } catch {
                throw replacement;
              }
              throw new Error('Expected body failure');
            },
          },
        ),
      });
      check(
        (await failure(perform(client, mode))) === replacement,
        `${mode}: explicit adapter error takes precedence over source error`,
      );
    }
  }

  // Fail-fast acquisition must also stop siblings, including a manager's final waiter.
  for (const mode of ['buffered', 'streaming', 'export']) {
    for (const managed of [false, true]) {
      const entered = deferred(),
        stopped = deferred();
      const stop = new RequestCancellationError(
        'credential acquisition stopped',
      );
      let siblingSignal;
      const slow = provider(async (_request, signal) => {
        siblingSignal = signal;
        entered.resolve();
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              stopped.resolve(signal.reason);
              reject(signal.reason);
            },
            { once: true },
          ),
        );
      });
      const client = new FetchTransport(base, {
        ...sunday.authenticationAdapters(
          {
            application: managed ? new TokenManager(slow) : slow,
            failing: provider(async () => {
              await entered.promise;
              throw stop;
            }),
          },
          undefined,
          undefined,
        ),
        logger: {},
      });
      const result = failure(
        perform(client, mode, {
          security: [
            binding,
            {
              ...binding,
              provider: 'failing',
              transport: { location: 'header', name: 'X-Other' },
            },
          ],
        }),
      );
      check(
        (await result) === stop,
        `${mode}/${managed}: provider stop identity`,
      );
      check(
        (await stopped.promise) === stop && siblingSignal.aborted,
        `${mode}/${managed}: sibling cancelled with original error`,
      );
    }
  }

  for (const mode of ['buffered', 'streaming', 'export']) {
    for (const managed of [false, true]) {
      const entered = deferred(),
        signals = [];
      const abort = new AbortController();
      const pending = provider(async (_request, signal) => {
        signals.push(signal);
        if (signals.length === 2) entered.resolve();
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        );
      });
      const client = new FetchTransport(base, {
        ...sunday.authenticationAdapters(
          {
            application: managed ? new TokenManager(pending) : pending,
            second: managed ? new TokenManager(pending) : pending,
          },
          undefined,
          undefined,
        ),
        logger: {},
      });
      const result = failure(
        perform(client, mode, {
          signal: abort.signal,
          security: [
            binding,
            {
              ...binding,
              provider: 'second',
              transport: { location: 'header', name: 'X-Other' },
            },
          ],
        }),
      );
      await entered.promise;
      abort.abort(null);
      check(
        (await result) === null,
        `${mode}/${managed}: caller abort identity during parallel acquisition`,
      );
      await tick();
      check(
        signals.every((signal) => signal.aborted && signal.reason === null),
        `${mode}/${managed}: caller abort stops every acquisition`,
      );
    }
  }

  // GET/HEAD are bodyless even where native Request.body is unavailable (Firefox).
  for (const mode of ['buffered', 'streaming']) {
    let acquisitions = 0,
      invalidations = 0;
    const credentials = provider(async () => ({
      accessToken: ++acquisitions === 1 ? 'old' : 'new',
    }));
    credentials.reject = async () => {
      invalidations++;
      return true;
    };
    const client = new FetchTransport(base, {
      ...sunday.authenticationAdapters(
        { application: credentials },
        undefined,
        undefined,
      ),
      logger: {},
    });
    const spec = {
      pathTemplate: mode === 'streaming' ? '/auth-events' : '/auth',
      security: [binding],
    };
    check(
      (await failure(perform(client, mode, spec))).status === 401,
      `${mode}: rejection is not retried`,
    );
    check(
      (await perform(client, mode, {
        pathTemplate: mode === 'streaming' ? '/auth-events' : '/auth',
        security: [binding],
      })) === 'ok',
      `${mode}: authenticated recovery`,
    );
    check(
      acquisitions === 2 && invalidations === 1,
      `${mode}: bounded recovery and invalidation`,
    );
  }
  for (const [method, body] of [
    ['HEAD', undefined],
    ['OPTIONS', undefined],
    ['OPTIONS', 'payload'],
  ]) {
    let acquisitions = 0;
    const credentials = provider(async () => ({
      accessToken: ++acquisitions === 1 ? 'old' : 'new',
    }));
    credentials.reject = async () => true;
    const client = new FetchTransport(base, {
      ...sunday.authenticationAdapters(
        { application: credentials },
        undefined,
        undefined,
      ),
      logger: {},
    });
    const nativeFailure =
      body === undefined
        ? undefined
        : await fetch(base + '/auth', { method, body }).then(
            async (response) => {
              await response.body?.cancel();
              return undefined;
            },
            (error) => error,
          );
    const response = await client
      .transportResponse({
        method,
        body,
        contentTypes: [sunday.MediaType.Plain],
        pathTemplate: '/auth',
        security: [binding],
      })
      .catch((error) => {
        if (error.status === 401) return { status: 401 };
        if (nativeFailure && error instanceof nativeFailure.constructor)
          return { status: 401 };
        throw error;
      });
    check(
      response.status === 401 && acquisitions === 1,
      `${method}/${body}: conservative body replay safety`,
    );
    await response.body?.cancel();
  }

  // A single manager coordinates refresh, waiter cancellation, and stale receipt rejection.
  {
    const calls = [],
      started = deferred();
    const adapter = new RefreshingHeaderTokenAuthorizingAdapter((signal) => {
      const result = deferred();
      calls.push({ signal, result });
      started.resolve();
      return result.promise;
    });
    const abort = new AbortController(),
      reason = new Error('one waiter stopped');
    const first = failure(
      adapter.adapt(new Request(base, { signal: abort.signal })),
    );
    const second = adapter.adapt(new Request(base));
    await started.promise;
    await tick();
    check(calls.length === 1, 'refresh is coalesced');
    abort.abort(reason);
    check(
      (await first) === reason && !calls[0].signal.aborted,
      'one waiter does not cancel shared refresh',
    );
    calls[0].result.resolve({
      token: 'old',
      expires: new Date(Date.now() + 60000),
    });
    const oldRequest = await second;
    const rejected = () =>
      new Response(null, {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
      });
    await adapter.adapt(rejected(), oldRequest);
    check(adapter.shouldRefresh(), 'rejected refresh removed from manager');
    const next = adapter.adapt(new Request(base));
    await tick();
    check(calls.length === 2, 'rejection requires fresh acquisition');
    calls[1].result.resolve({
      token: 'new',
      expires: new Date(Date.now() + 60000),
    });
    check(
      (await next).headers.get('Authorization') === 'Bearer new',
      'rejected token never resurrected',
    );
    await adapter.adapt(rejected(), oldRequest);
    check(
      (await adapter.adapt(new Request(base))).headers.get('Authorization') ===
        'Bearer new' && calls.length === 2,
      'stale rejection preserves newer token',
    );
  }
  for (const error of [
    new Error('refresh failed'),
    new RequestCancellationError('refresh stopped'),
    null,
  ]) {
    const adapter = new RefreshingHeaderTokenAuthorizingAdapter(async () => {
      throw error;
    });
    check(
      (await failure(adapter.adapt(new Request(base)))) === error,
      'refresh callback error identity',
    );
  }
  {
    const started = deferred(),
      late = deferred(),
      stopped = deferred();
    let acquisitions = 0;
    const adapter = new RefreshingHeaderTokenAuthorizingAdapter(
      async (signal) => {
        if (++acquisitions > 1)
          return { token: 'new', expires: new Date(Date.now() + 60000) };
        signal.addEventListener('abort', () => stopped.resolve(signal.reason), {
          once: true,
        });
        started.resolve();
        return late.promise;
      },
    );
    const abort = new AbortController(),
      reason = new RequestCancellationError('last waiter stopped');
    const first = failure(
      adapter.adapt(new Request(base, { signal: abort.signal })),
    );
    await started.promise;
    abort.abort(reason);
    check(
      (await first) === reason && (await stopped.promise) === reason,
      'last waiter cancels refresher with original reason',
    );
    const next = adapter.adapt(new Request(base));
    late.resolve({ token: 'old', expires: new Date(Date.now() + 60000) });
    check(
      (await next).headers.get('Authorization') === 'Bearer new' &&
        acquisitions === 2,
      'late abandoned refresh cannot populate cache',
    );
  }

  // Concurrent next calls are FIFO; every pending read settles on closure or failure.
  {
    const client = new FetchTransport(base, { logger: {} });
    const events = iterator(client);
    const first = events.next(),
      second = events.next();
    check(
      (await first).value === 'one' && (await second).value === 'two',
      'concurrent reads settle FIFO',
    );
    const third = events.next(),
      fourth = events.next();
    await events.return();
    check(
      (await third).done && (await fourth).done && (await events.next()).done,
      'return settles every pending read',
    );
    const queued = deferred();
    const more = iterator(client, {}, (_codec, _event, _id, data) => {
      if (data === 'two') queued.resolve();
      return data;
    });
    check((await more.next()).value === 'one', 'first queued event');
    await queued.promise;
    await more.return();
    check((await more.next()).done, 'return discards queued events');
  }
  for (const reason of [
    new RequestCancellationError('iterator stopped'),
    null,
  ]) {
    const abort = new AbortController();
    const events = iterator(new FetchTransport(base, { logger: {} }), {
      pathTemplate: '/stalled',
      signal: abort.signal,
    });
    const first = failure(events.next()),
      second = failure(events.next());
    abort.abort(reason);
    check(
      (await first) === reason && (await second) === reason,
      'abort rejects every pending read with original identity',
    );
    check(
      (await failure(events.next())) === reason,
      'future read preserves terminal identity',
    );
    await events.return();
  }
  {
    const reason = new RequestCancellationError('explicit throw');
    const events = iterator(new FetchTransport(base, { logger: {} }), {
      pathTemplate: '/stalled',
    });
    const first = failure(events.next()),
      second = failure(events.next());
    await failure(events.throw(reason));
    check(
      (await first) === reason && (await second) === reason,
      'throw rejects every pending read',
    );
  }
  return checks;
}
