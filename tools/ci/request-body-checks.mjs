// Shared contract checks run unchanged in browsers, Node, and Bun.
export async function checkRequestBody(sunday, expectedStreaming) {
  const {
    prepareRequestBody,
    bufferToBlob,
    supportsStreamingUploads,
    RequestCancellationError,
  } = sunday;
  let checks = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const failure = (promise) =>
    promise.then(
      () => {
        throw new Error('Expected request body preparation to fail');
      },
      (error) => error,
    );
  const bytes = (...chunks) =>
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
        controller.close();
      },
    });
  check(
    supportsStreamingUploads() === expectedStreaming,
    'Incorrect upload capability',
  );
  for (const body of [
    undefined,
    null,
    'text',
    new Blob(['blob']),
    new Uint8Array([1]),
    new FormData(),
  ]) {
    check(
      (await prepareRequestBody(body)) === body,
      'Non-stream body was changed',
    );
  }
  const stream = bytes([1, 2], [3, 4]);
  const prepared = await prepareRequestBody(stream);
  check(
    expectedStreaming
      ? prepared instanceof ReadableStream
      : prepared instanceof Blob,
    'Wrong streaming fallback',
  );
  check(
    [...new Uint8Array(await new Response(prepared).arrayBuffer())].join() ===
      '1,2,3,4',
    'Preparation corrupted bytes',
  );

  const reused = new Uint8Array(3);
  let next = 1;
  const copied = await bufferToBlob(
    new ReadableStream(
      {
        pull(controller) {
          if (next > 3) {
            controller.close();
            return;
          }
          reused[1] = next++;
          controller.enqueue(reused.subarray(1, 2));
        },
      },
      { highWaterMark: 0 },
    ),
    { maxBytes: 3 },
  );
  check(
    [...new Uint8Array(await copied.arrayBuffer())].join() === '1,2,3',
    'Buffering must snapshot chunk views',
  );

  for (const error of [
    new Error('source failure'),
    new RequestCancellationError('source stopped'),
    null,
  ]) {
    const original = await failure(
      bufferToBlob(
        new ReadableStream({
          start(c) {
            c.error(error);
          },
        }),
      ),
    );
    check(original === error, 'Source error identity was lost');
  }
  for (const reason of [
    new Error('cancelled'),
    new RequestCancellationError('stopped'),
    null,
    false,
    0,
    '',
  ]) {
    for (const preAborted of [false, true]) {
      const abort = new AbortController();
      let cancelled = false,
        cancellationReason;
      let entered;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const source = new ReadableStream(
        {
          pull() {
            entered();
            return new Promise(() => {});
          },
          cancel(value) {
            cancelled = true;
            cancellationReason = value;
            // Cleanup may never settle; callers must still receive their original reason promptly.
            return new Promise(() => {});
          },
        },
        { highWaterMark: 0 },
      );
      if (preAborted) abort.abort(reason);
      const pending = bufferToBlob(source, { signal: abort.signal });
      if (!preAborted) {
        await started;
        abort.abort(reason);
      }
      check(
        (await failure(pending)) === reason,
        'Abort reason identity was lost',
      );
      check(
        cancelled && cancellationReason === reason && !source.locked,
        'Source was not cancelled/released',
      );
    }
  }
  let cancelledWith;
  const tooLarge = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(4));
    },
    cancel(reason) {
      cancelledWith = reason;
      throw new Error('cleanup failed');
    },
  });
  const overflow = await failure(bufferToBlob(tooLarge, { maxBytes: 3 }));
  check(
    overflow instanceof RangeError &&
      cancelledWith === overflow &&
      !tooLarge.locked,
    'Limit error or cleanup was lost',
  );
  check(
    (await failure(
      bufferToBlob(bytes(new Uint8Array(16 * 1024 * 1024 + 1))),
    )) instanceof RangeError,
    'Default buffer bound was ignored',
  );
  check(
    (await bufferToBlob(bytes(), { maxBytes: 0 })).size === 0,
    'Empty upload should fit zero bound',
  );
  for (const maxBytes of [-1, Infinity, NaN, 1.5]) {
    check(
      (await failure(bufferToBlob(bytes(), { maxBytes }))) instanceof
        RangeError,
      'Invalid bound accepted',
    );
  }
  check(
    (await failure(
      bufferToBlob(
        new ReadableStream({
          start(c) {
            c.enqueue('not bytes');
            c.close();
          },
        }),
      ),
    )) instanceof TypeError,
    'Non-byte stream accepted',
  );
  return checks;
}
