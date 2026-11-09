// Shared by browsers, Node, and Bun; invoked inside the lifecycle suite's rejection monitor.
export async function checkCredentialBoundaries(s, base) {
  let checks = 0;
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks++;
  };
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  };
  const failure = (promise) =>
    promise.then(
      () => {
        throw new Error('Expected failure');
      },
      (error) => error,
    );
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const within = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label)), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const binding = {
    scheme: 'test',
    provider: 'test',
    flow: 'external',
    scopes: [],
    transport: { location: 'header', name: 'Authorization', prefix: 'Bearer' },
  };
  const perform = async (client, mode, signal) => {
    const spec = {
      method: 'GET',
      pathTemplate: '/credential-events',
      security: [binding],
      signal,
    };
    if (mode === 'export')
      return (await client.transportRequest(spec)).headers.get('Authorization');
    if (mode === 'buffered')
      return (await client.transportResponse(spec)).text();
    const events = client
      .eventStream(spec, (_c, _e, _id, data) => data)
      [Symbol.asyncIterator]();
    try {
      return (await events.next()).value;
    } finally {
      await events.return();
    }
  };

  for (const phase of ['acquire', 'refresh']) {
    for (const mode of ['export', 'buffered', 'streaming']) {
      for (const completion of ['pending', 'resolve', 'reject']) {
        for (const reason of [
          new s.RequestCancellationError('cancel acquisition'),
          new Error('cancel acquisition'),
          null,
        ]) {
          const started = deferred(),
            old = deferred(),
            abort = new AbortController();
          let calls = 0,
            providerSignal;
          const operation = async (_request, signal) => {
            calls++;
            if (calls === 1) {
              providerSignal = signal;
              started.resolve();
              return old.promise;
            }
            return { accessToken: 'fresh', refreshToken: 'fresh-refresh' };
          };
          const values = new Map(),
            saved = [];
          const manager = new s.TokenManager(
            {
              identity: 'test',
              configure: () => ({ clientIdentity: 'test' }),
              acquire:
                phase === 'acquire'
                  ? operation
                  : async () => ({
                      accessToken: 'seed',
                      refreshToken: 'seed-refresh',
                    }),
              ...(phase === 'refresh'
                ? {
                    refresh: (request, _token, signal) =>
                      operation(request, signal),
                  }
                : {}),
            },
            {
              store: {
                load: async (key) => values.get(key),
                save: async (key, tokens) => {
                  values.set(key, tokens);
                  saved.push(tokens.accessToken);
                },
                remove: async (key) => {
                  values.delete(key);
                },
              },
            },
          );
          if (phase === 'refresh')
            await manager.invalidate(await manager.credentials(binding));
          const client = new s.FetchTransport(base, {
            logger: {},
            tokenProviders: { test: manager },
          });
          const first = failure(perform(client, mode, abort.signal));
          await started.promise;
          abort.abort(reason);
          check(
            (await first) === reason && providerSignal.reason === reason,
            `${mode}/${phase}: cancellation identity`,
          );
          const result = await within(
            perform(client, mode),
            `${mode}/${phase}: cancelled provider retained lock`,
          );
          check(
            result.includes('Bearer fresh') && calls === 2,
            `${mode}/${phase}: successor completes before abandoned provider`,
          );
          if (completion === 'resolve')
            old.resolve({
              accessToken: 'stale',
              refreshToken: 'stale-refresh',
            });
          if (completion === 'reject')
            old.reject(new s.RequestCancellationError('late rejection'));
          await tick();
          const cached = await manager.credentials(binding);
          check(
            cached.tokens.accessToken === 'fresh' &&
              calls === 2 &&
              !saved.includes('stale'),
            `${mode}/${phase}/${completion}: no late cache mutation`,
          );
        }
      }
    }
  }

  // Cancellation must not abandon a storage mutation: a late remove could erase a successor's token.
  {
    const removing = deferred(),
      finishRemove = deferred(),
      values = new Map();
    let acquires = 0,
      refreshes = 0,
      loads = 0;
    const manager = new s.TokenManager(
      {
        identity: 'test',
        configure: () => ({ clientIdentity: 'test' }),
        acquire: async () => ({
          accessToken: ++acquires === 1 ? 'seed' : 'fresh',
          refreshToken: 'refresh',
        }),
        refresh: async () => {
          refreshes++;
          throw new s.TokenProviderError('invalidGrant');
        },
      },
      {
        store: {
          load: async (key) => {
            loads++;
            return values.get(key);
          },
          save: async (key, tokens) => {
            values.set(key, tokens);
          },
          remove: async (key) => {
            removing.resolve();
            await finishRemove.promise;
            values.delete(key);
          },
        },
      },
    );
    const credentials = { ...binding, flow: 'clientCredentials' };
    await manager.invalidate(await manager.credentials(credentials));
    const abort = new AbortController(),
      reason = new s.RequestCancellationError('cancel during remove');
    const first = failure(manager.credentials(credentials, abort.signal));
    await removing.promise;
    abort.abort(reason);
    check(
      (await first) === reason,
      'store removal does not delay caller cancellation',
    );
    const priorLoads = loads,
      second = manager.credentials(credentials);
    await tick();
    check(
      loads === priorLoads && acquires === 1,
      'pending storage mutation retains serialization',
    );
    finishRemove.resolve();
    check(
      (await within(second, 'store lock not released')).tokens.accessToken ===
        'fresh' &&
        acquires === 2 &&
        refreshes === 1,
      'cancelled invalid-grant fallback cannot start a detached acquisition',
    );
  }

  // Once a rotated refresh token is being persisted, finishing that commit still belongs to the manager.
  {
    const saving = deferred(),
      finishSave = deferred(),
      values = new Map();
    let refreshes = 0;
    const manager = new s.TokenManager(
      {
        identity: 'test',
        configure: () => ({ clientIdentity: 'test' }),
        acquire: async () => ({
          accessToken: 'seed',
          refreshToken: 'seed-refresh',
        }),
        refresh: async () => {
          refreshes++;
          return { accessToken: 'rotated', refreshToken: 'rotated-refresh' };
        },
      },
      {
        store: {
          load: async (key) => values.get(key),
          save: async (key, tokens) => {
            if (tokens.accessToken === 'rotated') {
              saving.resolve();
              await finishSave.promise;
            }
            values.set(key, tokens);
          },
          remove: async (key) => {
            values.delete(key);
          },
        },
      },
    );
    await manager.invalidate(await manager.credentials(binding));
    const abort = new AbortController(),
      reason = new s.RequestCancellationError('cancel during commit');
    const first = failure(manager.credentials(binding, abort.signal));
    await saving.promise;
    abort.abort(reason);
    check(
      (await first) === reason,
      'commit does not delay caller cancellation',
    );
    const second = manager.credentials(binding);
    finishSave.resolve();
    const lease = await within(second, 'commit not released');
    check(
      lease.tokens.refreshToken === 'rotated-refresh' && refreshes === 1,
      'rotated refresh commit is retained and shared',
    );
  }

  const native = await fetch(base + '/credential-redirect?api-key=secret', {
    redirect: 'manual',
  });
  const expectedStatus = native.status,
    expectedType = native.type,
    nativeBody = native.body;
  await native.body?.cancel();
  for (const mode of ['buffered', 'streaming']) {
    for (const location of ['header', 'query']) {
      for (const stop of [false, true]) {
        const marker = new s.RequestCancellationError('response adapter stop');
        let adaptations = 0;
        const security = {
          ...binding,
          transport: { location, name: 'api-key' },
        };
        const client = new s.FetchTransport(base, {
          logger: {},
          tokenProviders: {
            test: {
              identity: 'test',
              configure: () => ({ clientIdentity: 'test' }),
              acquire: async () => ({ accessToken: 'secret' }),
            },
          },
          responseAdapter: {
            adapt(response) {
              adaptations++;
              check(
                response.status === expectedStatus &&
                  response.type === expectedType,
                `${mode}/${location}: native redirect metadata`,
              );
              check(
                !response.url.includes('secret'),
                `${mode}/${location}: credential URL redaction`,
              );
              if (location === 'query')
                check(
                  new URL(response.url).searchParams.get('api-key') ===
                    '[redacted]',
                  'query credential replaced',
                );
              if (response.status === 0)
                check(
                  !!response.body === !!nativeBody &&
                    (response.body === null) === (nativeBody === null),
                  'opaque body availability matches native Fetch',
                );
              if (stop) throw marker;
              void response.body?.cancel();
              return new Response(
                mode === 'streaming' ? 'data: handled\n\n' : 'handled',
              );
            },
          },
        });
        const spec = {
          method: 'GET',
          pathTemplate: '/credential-redirect',
          security: [security],
        };
        const operation = async () => {
          if (mode === 'buffered')
            return (await client.transportResponse(spec)).text();
          const events = client
            .eventStream(spec, (_c, _t, _id, data) => data)
            [Symbol.asyncIterator]();
          try {
            return (await events.next()).value;
          } finally {
            await events.return();
          }
        };
        const outcome = await within(
          stop ? failure(operation()) : operation(),
          'redirect did not reach response adapter',
        );
        check(
          outcome === (stop ? marker : 'handled') && adaptations === 1,
          `${mode}/${location}: adapter result and stop identity`,
        );
      }
    }
  }
  return checks;
}
