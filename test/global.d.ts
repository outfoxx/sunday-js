declare global {
  namespace jasmine {
    interface Matchers<T> {
      toHaveBytes(expected: Expected<ArrayBuffer>): boolean;
    }
  }
}

export {};
