// Copyright 2020 Outfox, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export interface Logger {
  trace?(...data: unknown[]): void;
  debug?(...data: unknown[]): void;
  info?(...data: unknown[]): void;
  log?(...data: unknown[]): void;
  warn?(...data: unknown[]): void;
  error?(...data: unknown[]): void;
}

export enum LogLevel {
  Trace = 4,
  Debug = 3,
  Info = 2,
  Warn = 1,
  Error = 0,
  None = -1,
}

export function levelLogger(
  level: LogLevel,
  logger?: Logger,
): Logger | undefined {
  if (!logger) {
    return undefined;
  }
  return {
    log: logger?.log?.bind(logger),
    trace: level >= LogLevel.Trace ? logger?.trace?.bind(logger) : undefined,
    debug: level >= LogLevel.Debug ? logger?.debug?.bind(logger) : undefined,
    info: level >= LogLevel.Info ? logger?.info?.bind(logger) : undefined,
    warn: level >= LogLevel.Warn ? logger?.warn?.bind(logger) : undefined,
    error: level >= LogLevel.Error ? logger?.error?.bind(logger) : undefined,
  };
}
