declare global {
  namespace jasmine {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Matchers<T> {
      toHaveBytes(expected: Expected<ArrayBuffer>): boolean;
    }
  }
}

export {};
