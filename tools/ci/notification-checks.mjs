// Observer exceptions belong to native EventTarget reporting, not the request retry policy.
export async function checkNotifications(s, base) {
  let checks = 0;
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks++;
  };
  const within = async (promise) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Notification lifecycle stalled')),
            2500,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const reported = [];
  let reportedNotification;
  const onReported = (error) => {
    reported.push(error);
    reportedNotification?.();
  };
  const awaitReport = async (start) => {
    if (reported.length > start) return;
    try {
      await within(
        new Promise((resolve) => {
          reportedNotification = resolve;
        }),
      );
    } finally {
      reportedNotification = undefined;
    }
  };
  const onBrowserError = (event) => {
    event.preventDefault();
    onReported(event.error);
  };
  const onBrowserRejection = (event) => {
    event.preventDefault();
    onReported(event.reason);
  };
  const node =
    typeof process !== 'undefined' && typeof process.on === 'function';
  if (node) {
    process.on('uncaughtException', onReported);
    process.on('unhandledRejection', onReported);
  } else {
    globalThis.addEventListener('error', onBrowserError);
    globalThis.addEventListener('unhandledrejection', onBrowserRejection);
  }
  try {
    for (const asynchronous of [false, true]) {
      for (const phase of ['open', 'message', 'error']) {
        for (const registration of ['property', 'listener']) {
          for (const reason of [
            new Error('observer failure'),
            new s.RequestCancellationError('observer stop'),
            new DOMException('observer abort', 'AbortError'),
          ]) {
            const start = reported.length,
              messages = [],
              networkError = new TypeError('offline');
            let calls = 0,
              notices = 0,
              observed = 0,
              originalError;
            const source = new s.FetchEventSource(base, {
              logger: {},
              fetch: async () => {
                calls++;
                if (phase === 'error') {
                  if (calls === 1) return new Response('retry: 0\n');
                  if (calls === 2) throw networkError;
                }
                return new Response(
                  new ReadableStream({
                    start(controller) {
                      controller.enqueue(
                        new TextEncoder().encode(
                          'retry: 0\nevent: named\ndata: one\n\ndata: two\n\n',
                        ),
                      );
                    },
                  }),
                );
              },
            });
            const throwing = function (event) {
              observed++;
              check(
                this === source && event.target === source,
                'observer has native receiver and event target',
              );
              if (observed === 1) {
                if (asynchronous) return Promise.reject(reason);
                throw reason;
              }
            };
            if (registration === 'property') source['on' + phase] = throwing;
            else
              source.addEventListener(
                phase === 'message' ? 'named' : phase,
                throwing,
              );
            source.addEventListener('error', (event) => {
              notices++;
              originalError = event.error;
            });
            try {
              await within(
                new Promise((resolve) => {
                  source.addEventListener('named', (event) =>
                    messages.push(event.data),
                  );
                  source.addEventListener('message', (event) => {
                    messages.push(event.data);
                    resolve();
                  });
                  source.connect();
                }),
              );
              await awaitReport(start);
              check(
                messages.join(',') === 'one,two',
                `${phase}/${registration}: no lost or duplicated messages`,
              );
              check(
                calls === (phase === 'error' ? 3 : 1),
                `${phase}/${registration}: observer cannot create or suppress retries`,
              );
              check(
                notices === (phase === 'error' ? 1 : 0) &&
                  (phase !== 'error' || originalError === networkError),
                'observer does not replace the network failure',
              );
              check(
                reported.length === start + 1 && reported[start] === reason,
                `${asynchronous ? 'async' : 'sync'}/${phase}/${registration}/${reason.name}: native observer identity; reported ${reported
                  .slice(start)
                  .map((error) => error?.message)
                  .join(', ')}`,
              );
              check(
                observed ===
                  (registration === 'property' && phase === 'message' ? 2 : 1),
                'properties retain named message delivery',
              );
            } finally {
              source.close();
            }
          }
        }
      }
    }
    // Terminal adapter errors still close the source even when its error observer throws.
    for (const phase of ['request', 'response']) {
      const stop = new s.RequestCancellationError('adapter stop'),
        observer = new Error('error observer');
      let attempts = 0,
        delivered;
      const client = new s.FetchTransport(base, {
        logger: {},
        [phase + 'Adapter']: {
          adapt() {
            attempts++;
            throw stop;
          },
        },
      });
      const source = client.eventSource({
        method: 'GET',
        pathTemplate: '/credential-events',
      });
      source.onerror = () => {
        throw observer;
      };
      const start = reported.length;
      try {
        await within(
          new Promise((resolve) => {
            source.addEventListener('error', (event) => {
              delivered = event.error;
              resolve();
            });
            source.connect();
          }),
        );
        await awaitReport(start);
        check(
          source.readyState === source.CLOSED &&
            delivered === stop &&
            attempts === 1,
          phase + ': terminal stop identity survives observer failure',
        );
        check(
          reported.length === start + 1 && reported[start] === observer,
          'terminal observer is reported separately',
        );
      } finally {
        source.close();
      }
    }
  } finally {
    if (node) {
      process.removeListener('uncaughtException', onReported);
      process.removeListener('unhandledRejection', onReported);
    } else {
      globalThis.removeEventListener('error', onBrowserError);
      globalThis.removeEventListener('unhandledrejection', onBrowserRejection);
    }
  }
  // Native propagation can skip a property; temporary forwarding must not survive dispatch.
  {
    const source = new s.FetchEventSource(base, { logger: {} });
    const first = new Error('first'),
      second = new Error('second');
    const seen = [];
    source.onerror = (event) => seen.push(event.error);
    source.addEventListener(
      'error',
      (event) => event.stopImmediatePropagation(),
      { once: true },
    );
    source.fireErrorEvent(first);
    source.fireErrorEvent(second);
    check(
      seen.length === 1 && seen[0] === second,
      'skipped property listener cannot leak into the next notification',
    );
    source.onerror = null;
    source.fireErrorEvent(first);
    check(seen.length === 1, 'clearing a handler takes effect immediately');
  }
  // A registered listener may dispatch recursively before the outer property runs.
  {
    const source = new s.FetchEventSource(base, { logger: {} });
    const outer = new Error('outer'),
      inner = new Error('inner'),
      seen = [];
    source.onerror = (event) => seen.push(event.error);
    source.addEventListener('error', () => source.fireErrorEvent(inner), {
      once: true,
    });
    source.fireErrorEvent(outer);
    check(
      seen.length === 2 && seen[0] === inner && seen[1] === outer,
      'recursive dispatch preserves each original event exactly once',
    );
  }
  return checks;
}
