export interface Logger {
  trace?(...data: unknown[]): void;
  debug?(...data: unknown[]): void;
  info?(...data: unknown[]): void;
  log?(...data: unknown[]): void;
  warn?(...data: unknown[]): void;
  error?(...data: unknown[]): void;
}
