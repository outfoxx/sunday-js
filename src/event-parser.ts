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

/** Message fields dispatched at a blank line; ID-only frames update the reconnect cursor. */
export interface EventInfo {
  /** Last valid ID in this frame; NUL-containing fields are ignored. */
  id?: string;
  event?: string;
  data?: string;
}

/** Connection controls reported immediately, independently of message boundaries. */
export interface EventControl {
  /** A valid non-negative safe integer, retaining its wire representation. */
  retry?: string;
  keepalive?: string;
  'retry-max'?: string;
}

/** Incremental UTF-8 SSE parser. Create one instance per connection; incomplete events end with it. */
export class EventParser {
  // Node can strip two consecutive BOMs when the first spans chunks; remove exactly one here.
  private readonly decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  private atStart = true;
  private readonly lineParts: string[] = [];
  private event: EventInfo = {};
  private readonly data: string[] = [];
  private skipLF = false;

  /** Receives each completed control line, even when EOF discards the unfinished message. */
  constructor(
    private readonly control: (control: EventControl) => void = () => {},
  ) {}

  /** Parses complete lines and events, discarding the rest of a chunk when the signal aborts. */
  process(
    buffer: ArrayBuffer | ArrayBufferView,
    dispatcher: (eventInfo: EventInfo) => void,
    signal?: AbortSignal,
  ): void {
    if (signal?.aborted) {
      this.discard();
      return;
    }
    let text = this.decoder.decode(buffer, { stream: true });
    if (this.atStart && text.length) {
      this.atStart = false;
      if (text[0] === '\ufeff') text = text.slice(1);
    }
    let start = 0;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      // A CR completes its line immediately; only its optional following LF is skipped.
      if (this.skipLF) {
        this.skipLF = false;
        if (character === '\n') {
          start = index + 1;
          continue;
        }
      }
      if (character !== '\r' && character !== '\n') continue;
      this.lineParts.push(text.slice(start, index));
      const line = this.lineParts.join('');
      this.lineParts.length = 0;
      this.skipLF = character === '\r';
      start = index + 1;
      if (line) {
        this.processLine(line);
      } else {
        const event = this.event;
        if (this.data.length) event.data = this.data.join('\n');
        this.event = {};
        this.data.length = 0;
        if (event.data !== undefined || event.id !== undefined)
          dispatcher(event);
      }
      if (signal?.aborted) {
        this.discard();
        return;
      }
    }
    if (start < text.length) this.lineParts.push(text.slice(start));
  }

  private discard(): void {
    // decode() without stream resets UTF-8/BOM state, including a partial character in the
    // discarded tail. It must not contaminate a later call after cancellation.
    this.decoder.decode();
    this.atStart = true;
    this.lineParts.length = 0;
    this.event = {};
    this.data.length = 0;
    this.skipLF = false;
  }

  private processLine(line: string): void {
    const colon = line.indexOf(':');
    const key = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (key) {
      case 'data':
        this.data.push(value);
        break;
      case 'id':
        if (!value.includes('\0')) this.event.id = value;
        break;
      case 'retry':
        if (parseEventMilliseconds(value) !== undefined)
          this.control({ retry: value });
        break;
      case 'event':
        this.event.event = value;
        break;
      case 'keepalive':
      case 'retry-max':
        this.control({ [key]: value });
        break;
    }
  }
}

/** @internal Parses bounded SSE millisecond values without accepting partial numbers. */
export function parseEventMilliseconds(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const milliseconds = Number(value);
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}
