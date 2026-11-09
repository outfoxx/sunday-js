// Connection controls, activity, and notification contracts shared by all five runtimes.
export async function checkSSEControls(s, base) {
  let checks = 0;
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks++;
  };
  const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
  const within = async (operation) => {
    let timer;
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('SSE control regression timed out')),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  // Exercise the actual native timers: an overflowing delay used to reconnect immediately.
  for (const delay of [2147483648, Number.MAX_SAFE_INTEGER]) {
    let calls = 0;
    const source = new s.FetchEventSource(base, {
      logger: {},
      fetch: async () => {
        calls++;
        return new Response(`retry: ${delay}\n`);
      },
    });
    try {
      source.connect();
      await tick(30);
      check(
        source.retryTime === delay && calls === 1,
        'oversized retry does not overflow into reconnects',
      );
    } finally {
      source.close();
    }
  }
  // Drive long timers without waiting days, while still exercising the public connection lifecycle.
  {
    const nativeTimeout = globalThis.setTimeout;
    const scheduled = [];
    let calls = 0;
    const source = new s.FetchEventSource(base, {
      logger: {},
      fetch: async () => {
        if (++calls === 1)
          return new Response(
            'retry: 1200000000\nretry-max: 9007199254740991\n',
          );
        throw new TypeError('network unavailable');
      },
    });
    globalThis.setTimeout = (callback, delay, ...args) => {
      const handle = nativeTimeout(callback, delay, ...args);
      if (delay > 1000) scheduled.push({ callback, delay, handle });
      return handle;
    };
    try {
      source.connect();
      for (let attempt = 0; attempt < 4; attempt++) {
        for (let i = 0; scheduled.length <= attempt && i < 100; i++)
          await tick();
        const timer = scheduled[attempt];
        check(
          !!timer && timer.delay <= 2147483647 && timer.delay >= 1200000000,
          'backoff stays within native timer range',
        );
        clearTimeout(timer.handle);
        timer.callback();
      }
    } finally {
      source.close();
      for (const timer of scheduled) clearTimeout(timer.handle);
      globalThis.setTimeout = nativeTimeout;
    }
  }
  // Real HTTP/1 and HTTP/2 connections: controls apply at line end, not event dispatch.
  {
    const source = new s.FetchEventSource(base + '/sse-retry-line', {
      logger: {},
    });
    let opens = 0,
      messages = 0;
    try {
      await within(
        new Promise((resolve, reject) => {
          source.onmessage = () => messages++;
          source.onerror = (event) => reject(event.error);
          source.onopen = () => {
            if (++opens === 2) {
              source.close();
              resolve();
            }
          };
          source.connect();
        }),
      );
      check(
        source.retryTime === 100 && messages === 0,
        'retry line survives EOF without creating a message',
      );
    } finally {
      source.close();
    }
  }
  for (const kind of ['comments', 'partial']) {
    const source = new s.FetchEventSource(base + '/sse-activity?kind=' + kind, {
      logger: {},
      eventTimeout: 150,
      eventTimeoutCheckInterval: 20,
    });
    let messages = 0,
      errors = 0;
    try {
      const data = await within(
        new Promise((resolve, reject) => {
          source.onmessage = (event) => {
            messages++;
            source.close();
            resolve(event.data);
          };
          source.addEventListener('error', (event) => {
            errors++;
            source.close();
            reject(event.error);
          });
          source.connect();
        }),
      );
      check(
        data.endsWith('done') && messages === 1 && errors === 0,
        `${kind}: incoming bytes keep the connection alive without phantom messages`,
      );
    } finally {
      source.close();
    }
  }
  // Empty chunks are not activity and must not defeat inactivity detection.
  {
    let cancelled;
    const source = new s.FetchEventSource(base, {
      logger: {},
      eventTimeout: 40,
      eventTimeoutCheckInterval: 10,
      fetch: async () => {
        let timer;
        return new Response(
          new ReadableStream({
            start(controller) {
              timer = setInterval(
                () => controller.enqueue(new Uint8Array()),
                5,
              );
            },
            cancel(reason) {
              cancelled = reason;
              clearInterval(timer);
            },
          }),
        );
      },
    });
    try {
      const reason = await within(
        new Promise((resolve) => {
          source.addEventListener('error', (event) => {
            source.close(event.error);
            resolve(event.error);
          });
          source.connect();
        }),
      );
      check(
        reason.message === 'EventTimeout' && cancelled === reason,
        'empty chunks time out and preserve cleanup reason',
      );
    } finally {
      source.close();
    }
  }
  // Both notification APIs see the same terminal error. Adapters still preserve buffered failures.
  for (const phase of ['request', 'response']) {
    const marker = new s.RequestCancellationError(phase + ' stop');
    let attempts = 0;
    const client = new s.FetchTransport(base, {
      logger: {},
      [phase + 'Adapter']: {
        adapt() {
          attempts++;
          throw marker;
        },
      },
    });
    const spec = { method: 'GET', pathTemplate: '/credential-events' };
    let buffered;
    try {
      await client.transportResponse(spec);
    } catch (error) {
      buffered = error;
    }
    check(
      buffered === marker && attempts === 1,
      phase + ': buffered stop identity',
    );
    const source = client.eventSource(spec);
    let property, listener, propertyThis;
    source.onerror = function (event) {
      property = event;
      propertyThis = this;
    };
    try {
      await within(
        new Promise((resolve) => {
          source.addEventListener(
            'error',
            (event) => {
              listener = event;
              resolve();
            },
            { once: true },
          );
          source.connect();
        }),
      );
      check(
        property === listener &&
          listener.error === marker &&
          propertyThis === source,
        phase + ': property and listener preserve error identity and receiver',
      );
      check(
        source.readyState === source.CLOSED && attempts === 2,
        phase + ': no retry after terminal notification',
      );
    } finally {
      source.close();
    }
  }
  // A recoverable-error listener can stop retries; once/remove semantics remain native.
  {
    const error = new Error('offline');
    let calls = 0,
      property = 0,
      listener = 0,
      removed = 0;
    const source = new s.FetchEventSource(base, {
      logger: {},
      fetch: async () => {
        calls++;
        throw error;
      },
    });
    const removedListener = () => removed++;
    source.addEventListener('error', removedListener);
    source.removeEventListener('error', removedListener);
    source.onerror = () => property++;
    try {
      await within(
        new Promise((resolve) => {
          source.addEventListener(
            'error',
            (event) => {
              listener++;
              source.close(event.error);
              resolve();
            },
            { once: true },
          );
          source.connect();
        }),
      );
      await tick();
      source.fireErrorEvent(error);
      check(
        calls === 1 && source.readyState === source.CLOSED,
        'error listener vetoes reconnect',
      );
      check(
        property === 2 && listener === 1 && removed === 0,
        'native once and remove listener semantics',
      );
    } finally {
      source.close();
    }
  }
  return checks;
}
