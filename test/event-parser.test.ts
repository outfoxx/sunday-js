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

import { EventInfo, EventParser } from '../src/event-parser';

describe('EventParser', () => {
  const text = new TextEncoder();

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
      text.encode('\r\n\r\n\r\n\r\n'),
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
    expect(events[0].retry).toBe('');
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
    expect(events[0].retry).toBe('');
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });

  it('allows empty values for fields (without colons)', () => {
    const eventBuffer = text.encode('retry\nevent\nid\ndata\n\n').buffer;

    const parser = new EventParser();

    const events: EventInfo[] = [];
    parser.process(eventBuffer, (ei) => events.push(ei));

    expect(events.length).toBe(1);
    expect(events[0].retry).toBe('');
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
    expect(events[0].retry).toBeUndefined();
    expect(events[0].event).toBe('');
    expect(events[0].id).toBe('');
    expect(events[0].data).toBe('');
  });
});
