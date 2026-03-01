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

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

export function errorToMessage(value: unknown, defMsg?: string): string {
  return isError(value) ? value.message : defMsg ?? `${fmtMsg(value)}`;
}

function fmtMsg(value: unknown): string {
  if (value instanceof Object) {
    return JSON.stringify(value);
  }
  return `${value}`;
}
