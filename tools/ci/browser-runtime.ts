// Browser test entrypoint exposes the parser submodule without changing the package's root exports.
export * from '../../src/index.js';
export { EventParser } from '../../src/event-parser.js';

/** Reports the stalled browser case before Bun's outer timeout tears down the shared HTTP peer. */
export async function runBrowserChecks(
  run: (progress: (label: string) => void) => Promise<number>,
): Promise<number> {
  let lastCheck = 'starting';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run((label) => {
        lastCheck = label;
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Browser checks stalled after: ${lastCheck}`)),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
