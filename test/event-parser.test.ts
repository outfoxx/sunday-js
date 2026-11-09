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

import { describe, it, expect } from 'bun:test';
import { EventInfo, EventParser } from '../src/event-parser';

describe('EventParser', () => {
  const text = new TextEncoder();

  const parse = (chunks: Uint8Array[]): EventInfo[] => {
    const parser = new EventParser();
    const events: EventInfo[] = [];
    for (const chunk of chunks)
      parser.process(chunk, (event) => events.push(event));
    return events;
  };

  for (const first of ['\n', '\r', '\r\n']) {
    for (const second of ['\n', '\r', '\r\n']) {
      it(`recognizes line endings ${JSON.stringify([first, second])} at every byte split`, () => {
        const bytes = text.encode(`data: one${first}${second}data: two\n\n`);
        const expected =
          first === '\r' && second === '\n'
            ? [{ data: 'one\ntwo' }]
            : [{ data: 'one' }, { data: 'two' }];
        for (let split = 0; split <= bytes.length; split++) {
          expect(
            parse([
              bytes.subarray(0, split),
              new Uint8Array(),
              bytes.subarray(split),
            ]),
          ).toEqual(expected);
        }
      });
    }
  }

  it('replaces malformed UTF-8 without corrupting the following event', () => {
    const bytes = new Uint8Array([
      ...text.encode('data: '),
      0xe2,
      ...text.encode('\n\ndata: two\n\n'),
    ]);
    for (let split = 0; split <= bytes.length; split++) {
      expect(parse([bytes.subarray(0, split), bytes.subarray(split)])).toEqual([
        { data: '�' },
        { data: 'two' },
      ]);
    }
  });

  it('decodes split UTF-8 and strips exactly one stream-leading BOM', () => {
    const bytes = text.encode('\ufeffdata: café☕🚀\n\ndata: \ufeffvalue\n\n');
    expect(parse(Array.from(bytes, (byte) => new Uint8Array([byte])))).toEqual([
      { data: 'café☕🚀' },
      { data: '\ufeffvalue' },
    ]);
    expect(
      parse([text.encode('\ufeff\ufeffdata: ignored\n\ndata: next\n\n')]).map(
        (event) => event.data,
      ),
    ).toEqual(['next']);
  });

  it('retains valid fields when later fields are invalid, at every byte boundary', () => {
    const bytes = text.encode(
      'id: kept\nid: bad\0id\nretry: 7\nretry: bad\nevent: named\nevent:\ndata: value\n\n',
    );
    for (let split = 0; split <= bytes.length; split++) {
      expect(parse([bytes.subarray(0, split), bytes.subarray(split)])).toEqual([
        { id: 'kept', event: '', data: 'value' },
      ]);
    }
  });

  it('discards comments and unknown fields while accumulating an event', () => {
    const parser = new EventParser();
    const events: EventInfo[] = [];
    for (let i = 0; i < 1000; i++)
      parser.process(text.encode(': heartbeat\nunknown: ignored\n'), (event) =>
        events.push(event),
      );
    expect(events).toEqual([]);
    parser.process(text.encode('data: value\n\n'), (event) =>
      events.push(event),
    );
    expect(events).toEqual([{ data: 'value' }]);
  });

  it('reads only the supplied view', () => {
    const bytes = text.encode('XXdata: value\n\nYY');
    expect(parse([bytes.subarray(2, bytes.length - 2)])).toEqual([
      { data: 'value' },
    ]);
  });

  it('discards an incomplete event at the end of a connection', () => {
    expect(parse([text.encode('data: complete\n\ndata: partial\n')])).toEqual([
      { data: 'complete' },
    ]);
  });

  it('stops within a chunk when its connection is aborted', () => {
    const parser = new EventParser();
    const abort = new AbortController();
    const events: EventInfo[] = [];
    parser.process(
      text.encode('data: first\n\ndata: second\n\ndata: incomplete').buffer,
      (event) => {
        events.push(event);
        abort.abort();
      },
      abort.signal,
    );
    expect(events).toEqual([{ data: 'first' }]);
    // A stopped batch must not leave its trailing partial event buffered for another call.
    parser.process(text.encode('data: next\n\n').buffer, (event) =>
      events.push(event),
    );
    expect(events).toEqual([{ data: 'first' }, { data: 'next' }]);
  });

  it('does not dispatch with an already aborted signal', () => {
    const parser = new EventParser();
    const events: EventInfo[] = [];
    parser.process(
      text.encode('data: ignored\n\n').buffer,
      (event) => events.push(event),
      AbortSignal.abort(),
    );
    expect(events).toEqual([]);
  });

  it('dispatches events with line-feeds', () => {
    const eventBuffer = text.encode(
      'event: hello\nid: 12345\ndata: Hello World!\n\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('hello');
    expect(events[0].id).toBe('12345');
    expect(events[0].data).toBe('Hello World!');
  });

  it('dispatches events with carriage-returns', () => {
    const eventBuffer = text.encode(
      'event: hello\rid: 12345\rdata: Hello World!\r\r',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('hello');
    expect(events[0].id).toBe('12345');
    expect(events[0].data).toBe('Hello World!');
  });

  it('dispatches events with carriage-returns/line-feeds', () => {
    const eventBuffer = text.encode(
      'event: hello\r\nid: 12345\r\ndata: Hello World!\r\n\r\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('hello');
    expect(events[0].id).toBe('12345');
    expect(events[0].data).toBe('Hello World!');
  });

  it('dispatches events with mixed carriage-returns, line-feeds & cr/lfs', () => {
    const eventBuffer = text.encode(
      'event: hello\nid: 12345\rdata: Hello World!\r\n\r\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('hello');
    expect(events[0].id).toBe('12345');
    expect(events[0].data).toBe('Hello World!');
  });

  it('dispatches chunked events', () => {
    const eventBuffers = [
      text.encode('eve').buffer,
      text.encode('nt: hello\nid: 123').buffer,
      text.encode('45\rdata: Hello World!\r').buffer,
      text.encode('\n\r\neve').buffer,
      text.encode('nt: hello\nid: 123').buffer,
      new ArrayBuffer(0),
      text.encode('45\rdata: Hello World!\r').buffer,
      text.encode('\n\r\n').buffer,
      text.encode('event: hello\nid: 123').buffer,
      text.encode('45\rdata: Hello World!\r\n\r\n').buffer,
      text.encode('45\rdata: Hello World!\r\n\r\n').buffer,
      text.encode('\r\n\r\n\r\n\r\n').buffer,
    ];

    const parser = new EventParser();

    const events: EventInfo[] = [];
    for (const eventBuffer of eventBuffers) {
      parser.process(eventBuffer, (ei) => events.push(ei));
    }

    expect(events.length).toBe(4);

    expect(events[0].event).toBe('hello');
    expect(events[0].id).toBe('12345');
    expect(events[0].data).toBe('Hello World!');

    expect(events[1].event).toBe('hello');
    expect(events[1].id).toBe('12345');
    expect(events[1].data).toBe('Hello World!');

    expect(events[2].event).toBe('hello');
    expect(events[2].id).toBe('12345');
    expect(events[2].data).toBe('Hello World!');

    expect(events[3].event).toBeUndefined();
    expect(events[3].id).toBeUndefined();
    expect(events[3].data).toBe('Hello World!');
  });

  it('concatenates data fields', () => {
    const eventBuffer = text.encode(
      'event: hello\ndata: Hello \ndata: World!\n\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('hello');
    expect(events[0].data).toBe('Hello \nWorld!');
  });

  it('allows empty values for fields', () => {
    const eventBuffer = text.encode(
      'retry: \nevent: \nid: \ndata: \n\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });

  it('allows empty values for fields (without spaces)', () => {
    const eventBuffer = text.encode('retry:\nevent:\nid:\ndata:\n\n').buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });

  it('reports controls immediately without dispatching an unfinished message', () => {
    const controls: object[] = [];
    const events: EventInfo[] = [];
    const parser = new EventParser((control) => controls.push(control));
    parser.process(
      text.encode(
        'data: unfinished\nretry: 500\nretry-max: 15000\nkeepalive: 10000\n',
      ),
      (event) => events.push(event),
    );
    expect(events).toEqual([]);
    expect(controls).toEqual([
      { retry: '500' },
      { 'retry-max': '15000' },
      { keepalive: '10000' },
    ]);
  });

  it('allows empty values for fields (without colons)', () => {
    const eventBuffer = text.encode('retry\nevent\nid\ndata\n\n').buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });

  it('ignores comment lines', () => {
    const eventBuffer = text.encode(
      ': this is a common\nevent\nid\ndata\n\n',
    ).buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });
});
