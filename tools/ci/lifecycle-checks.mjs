import { checkNotifications } from './notification-checks.mjs';
import { checkSSEControls } from './sse-control-checks.mjs';
import { checkCredentialBoundaries } from './credential-boundary-checks.mjs';

// Lifecycle contracts shared unchanged by Chromium, Firefox, WebKit, Node, and Bun.
export async function checkLifecycle(s, base, progress = () => {}) {
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
    progress(message);
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const failure = (promise) =>
    promise.then(
      () => {
        throw new Error('Expected rejection');
      },
      (error) => error,
    );
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const binding = (name) => ({
    scheme: name,
    provider: name,
    flow: 'external',
    scopes: [],
    transport: { location: 'header', name: 'X-' + name },
  });
  const provider = (acquire) => ({
    identity: 'application',
    configure: () => ({ clientIdentity: 'application' }),
    acquire,
  });
  const perform = async (client, mode, spec = {}) => {
    spec = { method: 'GET', pathTemplate: '/echo', ...spec };
    if (mode === 'export') return client.transportRequest(spec);
    if (mode === 'buffered') return client.transportResponse(spec);
    const iterator = client
      .eventStream(spec, (_c, _e, _id, data) => data)
      [Symbol.asyncIterator]();
    try {
      return (await iterator.next()).value;
    } finally {
      await iterator.return();
    }
  };
  // This suite captures intentional native observer reports, including rejected promises.
  progress('observer notifications');
  checks += await checkNotifications(s, base);
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  const onBrowserUnhandled = (event) => {
    event.preventDefault();
    onUnhandled(event.reason);
  };
  const node =
    typeof process !== 'undefined' && typeof process.on === 'function';
  if (node) process.on('unhandledRejection', onUnhandled);
  else globalThis.addEventListener('unhandledrejection', onBrowserUnhandled);
  try {
    progress('credential boundaries');
    checks += await checkCredentialBoundaries(s, base);
    progress('SSE controls');
    checks += await checkSSEControls(s, base);
    // Setup must be atomic, not just fail-fast once acquisition is already running.
    for (const mode of ['export', 'buffered', 'streaming']) {
      for (const missing of [0, 1, 2]) {
        let started = 0;
        const bindings = ['a', 'b', 'c'].map(binding);
        const providers = Object.fromEntries(
          bindings
            .filter((_, i) => i !== missing)
            .map((b) => [
              b.provider,
              provider((_r, signal) => {
                started++;
                return new Promise((_resolve, reject) =>
                  signal.addEventListener(
                    'abort',
                    () => reject(signal.reason),
                    { once: true },
                  ),
                );
              }),
            ]),
        );
        const client = new s.FetchTransport(base, {
          logger: {},
          tokenProviders: providers,
        });
        const error = await failure(
          perform(client, mode, { security: bindings }),
        );
        await tick();
        check(
          error instanceof s.TokenProviderError,
          `${mode}: missing provider result`,
        );
        check(
          started === 0,
          `${mode}: no acquisition before all providers resolve`,
        );
        check(
          unhandled.length === 0,
          `${mode}: setup leaves no unhandled promises`,
        );
      }
      // Synchronous configuration failures and asynchronous acquisition failures both observe
      // every started promise and cancel siblings with the same reason.
      for (const phase of ['configure', 'acquire']) {
        const reason = new s.RequestCancellationError(phase);
        let cancelled;
        const sibling = provider(
          (_r, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener(
                'abort',
                () => {
                  cancelled = signal.reason;
                  reject(signal.reason);
                },
                { once: true },
              );
            }),
        );
        const broken = provider(async () => {
          throw reason;
        });
        if (phase === 'configure')
          broken.configure = () => {
            throw reason;
          };
        const client = new s.FetchTransport(base, {
          logger: {},
          tokenProviders: { a: sibling, b: broken },
        });
        check(
          (await failure(
            perform(client, mode, { security: [binding('a'), binding('b')] }),
          )) === reason,
          `${mode}/${phase}: failure identity`,
        );
        await tick();
        check(
          cancelled === reason && unhandled.length === 0,
          `${mode}/${phase}: siblings observed and cancelled`,
        );
      }
    }

    // An application's cause is diagnostic context, not permission for Sunday to replace its error.
    const cases = () => {
      const stop = new s.RequestCancellationError('nested stop');
      const cyclic = new Error('cyclic');
      cyclic.cause = cyclic;
      const getter = new Error('cause must not be inspected');
      Object.defineProperty(getter, 'cause', {
        get() {
          throw new Error('inspected application cause');
        },
      });
      return [
        new Error('outer', { cause: stop }),
        new TypeError('outer type', {
          cause: new DOMException('inner', 'AbortError'),
        }),
        cyclic,
        getter,
      ];
    };
    for (const phase of ['request', 'response']) {
      for (const intended of cases()) {
        const client = new s.FetchTransport(base, {
          logger: {},
          [phase + 'Adapter']: {
            adapt() {
              throw intended;
            },
          },
        });
        check(
          (await failure(perform(client, 'buffered'))) === intended,
          `${phase}: buffered outer identity`,
        );
        if (phase === 'request')
          check(
            (await failure(perform(client, 'export'))) === intended,
            'export outer identity',
          );
        const source = client.eventSource({
          method: 'GET',
          pathTemplate: '/fifo-events',
        });
        const observed = deferred();
        source.onerror = (event) => {
          observed.resolve({
            error: event.error,
            terminal: source.readyState === source.CLOSED,
          });
          source.close();
        };
        source.connect();
        const value = await observed.promise;
        check(
          value.error === intended && !value.terminal,
          `${phase}: ordinary errors retain identity and reconnect policy`,
        );
      }
    }
    // Buffered decoding keeps its existing SundayError translation, rather than promoting a
    // nested cause to a stop. This is separate from the SSE decoder's direct error contract.
    for (const intended of cases()) {
      const client = new s.FetchTransport(base, {
        logger: {},
        mediaTypeDecoders: {
          supports: () => true,
          find: () => ({
            decode: async () => {
              throw intended;
            },
          }),
        },
      });
      const error = await failure(
        client.result({ method: 'GET', pathTemplate: '/echo' }, s.StringSchema),
      );
      check(
        error instanceof s.SundayError && error.message === intended.message,
        'buffered decoder retains its error policy',
      );
    }

    // A supplied Fetch callback is application code too, even when it rejects like native Fetch.
    for (const intended of cases()) {
      const observed = deferred();
      const source = new s.FetchEventSource(base, {
        logger: {},
        fetch: async () => {
          throw intended;
        },
      });
      source.onerror = (event) => {
        observed.resolve({
          error: event.error,
          terminal: source.readyState === source.CLOSED,
        });
        source.close();
      };
      source.connect();
      const value = await observed.promise;
      check(
        value.error === intended && !value.terminal,
        'custom Fetch callback preserves its error',
      );
    }

    // A failed authorization must stop an allocated upload with the same reason. Firefox has
    // consumed its fallback before authorization, so there is no live upload to cancel there.
    if (s.supportsStreamingUploads()) {
      for (const mode of ['export', 'buffered', 'streaming']) {
        for (const cleanup of ['throw', 'pending']) {
          const reason = new s.RequestCancellationError('authorization stop');
          let cancelled = 0,
            cancelledWith,
            source;
          const client = new s.FetchTransport(base, {
            logger: {},
            tokenProviders: {
              a: provider(async () => {
                throw reason;
              }),
            },
          });
          const body = s.StreamingBody.stream(
            () =>
              (source = new ReadableStream({
                cancel(value) {
                  cancelled++;
                  cancelledWith = value;
                  if (cleanup === 'throw') throw new Error('cleanup failure');
                  return new Promise(() => {});
                },
              })),
          );
          check(
            (await failure(
              perform(client, mode, {
                method: 'POST',
                body,
                contentTypes: [s.MediaType.OctetStream],
                security: [binding('a')],
              }),
            )) === reason,
            `${mode}: authorization error identity`,
          );
          check(
            cancelled === 1 && cancelledWith === reason && !source.locked,
            `${mode}: cleanup reason and release`,
          );
        }
      }
    }

    // Incomplete frames belong to one connection. Retry time and the last complete event ID
    // belong to the subscription and must survive EOF, a socket reset, and explicit reconnection.
    for (const ending of ['eof', 'reset']) {
      for (const partial of ['ascii', 'utf8']) {
        const client = new s.FetchTransport(base, { logger: {} });
        const events = client
          .eventStream(
            {
              method: 'GET',
              pathTemplate: `/lifecycle-events?ending=${ending}&partial=${partial}`,
            },
            (_c, _e, id, data) => ({ id, data }),
          )
          [Symbol.asyncIterator]();
        try {
          const first = await events.next(),
            second = await events.next();
          check(
            first.value.data === 'initial' && first.value.id === 'kept',
            'initial SSE event',
          );
          check(
            second.value.data === 'fresh' && second.value.id === 'kept',
            `${ending}/${partial}: fresh parser, retained event ID`,
          );
        } finally {
          await events.return();
        }
      }
    }
    {
      const client = new s.FetchTransport(base, { logger: {} });
      const source = client.eventSource({
        method: 'GET',
        pathTemplate: '/lifecycle-events?ending=batch',
      });
      const observed = deferred(),
        seen = [];
      source.onmessage = (event) => {
        seen.push([event.lastEventId, event.data]);
        source.close();
        if (seen.length === 1) source.connect();
        else observed.resolve();
      };
      source.connect();
      try {
        await observed.promise;
      } finally {
        source.close();
      }
      check(
        JSON.stringify(seen) ===
          JSON.stringify([
            ['kept', 'initial'],
            ['kept', 'fresh'],
          ]),
        'close and reconnect during dispatch cannot apply stale events or IDs',
      );
    }
    // The stop applies to the remainder of the current batch, all queued next() calls, and
    // future next() calls. Normal return and explicit abort must suppress callbacks too.
    for (const stop of ['decoder', 'abort', 'return']) {
      const reason = new s.RequestCancellationError('stop batch');
      const abort = new AbortController(),
        seen = [];
      const client = new s.FetchTransport(base, { logger: {} });
      const events = client
        .eventStream(
          {
            method: 'GET',
            pathTemplate: '/lifecycle-batch',
            signal: abort.signal,
          },
          (_c, _e, _id, data) => {
            seen.push(data);
            if (stop === 'decoder') throw reason;
            if (stop === 'abort') abort.abort(reason);
            else void events.return();
            return data;
          },
        )
        [Symbol.asyncIterator]();
      try {
        const pending = [events.next(), events.next()];
        const results = await Promise.all(
          pending.map((p) => (stop === 'return' ? p : failure(p))),
        );
        await tick();
        check(seen.join() === 'one', `${stop}: no callbacks after termination`);
        if (stop === 'return')
          check(
            results.every((r) => r.done) && (await events.next()).done,
            'return settles current and future readers',
          );
        else
          check(
            results.every((r) => r === reason) &&
              (await failure(events.next())) === reason,
            `${stop}: stop identity for all readers`,
          );
      } finally {
        await events.return();
      }
    }
    // Decoder-selected errors with causes still follow the decoder's own error policy.
    {
      const intended = new Error('decoder context', {
        cause: new s.RequestCancellationError('inner'),
      });
      const client = new s.FetchTransport(base, { logger: {} });
      const events = client
        .eventStream(
          { method: 'GET', pathTemplate: '/lifecycle-batch' },
          () => {
            throw intended;
          },
        )
        [Symbol.asyncIterator]();
      try {
        check(
          (await failure(events.next())) === intended,
          'SSE decoder outer identity',
        );
      } finally {
        await events.return();
      }
    }
    {
      const source = new s.FetchEventSource(base + '/empty-events', {
        logger: {},
      });
      const seen = [],
        observed = deferred();
      source.onmessage = (event) => {
        seen.push(event.data);
        if (event.data === 'tail') {
          source.close();
          observed.resolve();
        }
      };
      source.connect();
      try {
        await observed.promise;
      } finally {
        source.close();
      }
      check(
        JSON.stringify(seen) === JSON.stringify(['', '', 'skip', 'tail']),
        'control frames do not dispatch phantom events',
      );
    }
    // Error notifications and producer cancellation may synchronously close or replace a connection.
    for (const trigger of ['timeout', 'network']) {
      for (const action of ['close', 'abort', 'replace']) {
        const abort = new AbortController(),
          notice = deferred();
        const reason = new s.RequestCancellationError('callback stop');
        let attempts = 0,
          notices = 0;
        const source = new s.FetchEventSource(base, {
          logger: {},
          signal: abort.signal,
          eventTimeout: 10,
          eventTimeoutCheckInterval: 5,
          fetch: async () => {
            attempts++;
            if (trigger === 'network' && attempts === 1)
              throw new Error('network');
            return new Response(new ReadableStream());
          },
        });
        source.onerror = () => {
          notices++;
          if (action === 'abort') abort.abort(reason);
          else {
            source.close(reason);
            if (action === 'replace') source.connect();
          }
          notice.resolve();
        };
        source.connect();
        try {
          await notice.promise;
          await tick();
          check(notices === 1, `${trigger}/${action}: single notification`);
          check(
            attempts === (action === 'replace' ? 2 : 1),
            `${trigger}/${action}: no stale retry`,
          );
          check(
            source.readyState ===
              (action === 'replace' ? source.OPEN : source.CLOSED),
            `${trigger}/${action}: retains callback-selected state`,
          );
        } finally {
          source.close();
        }
      }
    }
    // Retiring a connection must not clear the reader, timers, or abort listener of a successor.
    {
      const abort = new AbortController(),
        replacement = deferred();
      let attempts = 0,
        successorSignal;
      const source = new s.FetchEventSource(base, {
        logger: {},
        signal: abort.signal,
        fetch: async (_request, signal) => {
          attempts++;
          if (attempts > 1) {
            successorSignal = signal;
            replacement.resolve();
          }
          return new Response(
            new ReadableStream({
              cancel() {
                if (attempts === 1) {
                  source.close();
                  source.connect();
                }
              },
            }),
          );
        },
      });
      source.connect();
      await tick();
      source.close();
      try {
        await replacement.promise;
        await tick();
        const reason = new s.RequestCancellationError('successor stop');
        abort.abort(reason);
        check(
          source.readyState === source.CLOSED &&
            successorSignal.reason === reason,
          'successor retains external cancellation listener',
        );
      } finally {
        source.close();
      }
    }
    // Last-Event-ID is UTF-8 on the wire, including Latin-1 characters and multi-byte scalars.
    for (const id of ['café', '☕🚀']) {
      const client = new s.FetchTransport(base, { logger: {} });
      const events = client
        .eventStream(
          {
            method: 'GET',
            pathTemplate: '/unicode-events',
            queryParameters: { id },
          },
          (_c, _type, receivedID, data) => ({ id: receivedID, data }),
        )
        [Symbol.asyncIterator]();
      try {
        const first = await events.next(),
          second = await events.next();
        check(
          first.value.id === id && first.value.data === 'initial',
          'Unicode ID delivered unchanged',
        );
        check(
          second.value.id === id && second.value.data === id,
          'Unicode ID reconnects with exact UTF-8 header bytes',
        );
      } finally {
        await events.return();
      }
    }
    // Synchronous request construction failures must be reported, never escape a retry timer.
    {
      const stopped = deferred();
      const source = new s.FetchEventSource(base + '/unicode-events?id=valid', {
        logger: {},
      });
      source.onmessage = () => {
        source.url = 'http://[';
      };
      source.onerror = (event) => {
        source.close();
        stopped.resolve(event.error);
      };
      source.connect();
      try {
        check(
          (await stopped.promise) instanceof TypeError,
          'synchronous retry setup failure is observed',
        );
      } finally {
        source.close();
      }
    }
    // Every failing iterator exit sends the same reason to all readers and upstream cleanup.
    for (const mode of ['decoder', 'throw']) {
      for (const reason of [
        new s.RequestCancellationError('iterator stop'),
        new Error('decoder'),
        null,
      ]) {
        for (const cleanup of ['resolve', 'reject', 'pending']) {
          let cancelled = 0,
            cancelledWith,
            sentSignal,
            body;
          const ready = deferred();
          const client = new s.FetchTransport(base, {
            logger: {},
            responseAdapter: {
              async adapt(response, request) {
                await response.body?.cancel();
                sentSignal = request.signal;
                body = new ReadableStream(
                  {
                    start(controller) {
                      if (mode === 'decoder')
                        controller.enqueue(
                          new TextEncoder().encode(
                            'data: one\n\ndata: ignored\n\n',
                          ),
                        );
                      if (mode === 'decoder') ready.resolve();
                    },
                    pull() {
                      ready.resolve();
                      return new Promise(() => {});
                    },
                    cancel(value) {
                      cancelled++;
                      cancelledWith = value;
                      if (cleanup === 'reject')
                        return Promise.reject(
                          new s.RequestCancellationError('cleanup'),
                        );
                      if (cleanup === 'pending') return new Promise(() => {});
                    },
                  },
                  { highWaterMark: 0 },
                );
                return new Response(body);
              },
            },
          });
          let decoded = 0;
          const events = client
            .eventStream({ method: 'GET', pathTemplate: '/echo' }, () => {
              decoded++;
              throw reason;
            })
            [Symbol.asyncIterator]();
          const pending = [failure(events.next()), failure(events.next())];
          try {
            await ready.promise;
            if (mode === 'throw')
              check(
                (await failure(events.throw(reason))) === reason,
                'iterator throw result identity',
              );
            check(
              (await Promise.all(pending)).every((error) => error === reason),
              `${mode}/${cleanup}: pending error identity`,
            );
            check(
              (await failure(events.next())) === reason,
              `${mode}/${cleanup}: future error identity`,
            );
            check(
              cancelled === 1 &&
                cancelledWith === reason &&
                sentSignal.reason === reason &&
                !body.locked,
              `${mode}/${cleanup}: original upstream reason and released source`,
            );
            check(
              decoded === (mode === 'decoder' ? 1 : 0),
              'no decoding after stop',
            );
          } finally {
            await events.return();
          }
        }
      }
    }
    // OAuth cleanup is disposal, not part of the result of a failed exchange/discovery.
    for (const mode of ['acquire', 'refresh', 'discovery']) {
      for (const cleanup of ['resolve', 'reject', 'pending']) {
        for (const status of mode === 'discovery'
          ? [403, 503]
          : [408, 429, 500, 503, 599]) {
          let cancelled = 0,
            cancelledWith;
          const provider = new s.FetchOAuthTokenProvider({
            identity: 'probe',
            clientId: 'probe',
            clientSecret: 'probe',
            authentication: 'client_secret_post',
            issuer: base,
            fetch: async () =>
              new Response(
                new ReadableStream({
                  cancel(reason) {
                    cancelled++;
                    cancelledWith = reason;
                    if (cleanup === 'reject')
                      return Promise.reject(
                        new s.RequestCancellationError('cleanup only'),
                      );
                    if (cleanup === 'pending') return new Promise(() => {});
                  },
                }),
                { status },
              ),
          });
          const request = {
            ...binding('oauth'),
            flow: 'clientCredentials',
            clientIdentity: 'probe',
            tokenUrl: base + '/token',
            ...(mode === 'discovery'
              ? { discoveryUrl: base + '/discovery' }
              : {}),
          };
          const signal = new AbortController().signal;
          const error = await failure(
            mode === 'refresh'
              ? provider.refresh(request, 'refresh', signal)
              : provider.acquire(request, signal),
          );
          check(
            error instanceof s.TokenProviderError &&
              error.reason === (status === 403 ? 'unavailable' : 'temporary'),
            `${mode}/${status}/${cleanup}: intended provider failure`,
          );
          check(
            cancelled === 1 && cancelledWith === error,
            `${mode}/${status}/${cleanup}: cleanup receives original failure`,
          );
        }
      }
    }
    await tick();
    check(
      unhandled.length === 0,
      'no detached rejections anywhere in the lifecycle matrix',
    );
  } finally {
    if (node) process.removeListener('unhandledRejection', onUnhandled);
    else
      globalThis.removeEventListener('unhandledrejection', onBrowserUnhandled);
  }
  return checks;
}
