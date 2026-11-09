// Portable byte fixtures: expected frames are independent of the parser implementation.
const encode = (text) => new TextEncoder().encode(text);
export const framingCases = [];
for (const first of ['\n', '\r', '\r\n']) {
  for (const second of ['\n', '\r', '\r\n']) {
    framingCases.push({
      name: `line endings ${JSON.stringify(first + second)}`,
      bytes: encode(`data: one${first}${second}data: two\n\n`),
      // CR followed by LF is one line ending, not an empty line between events.
      events:
        first === '\r' && second === '\n'
          ? [{ data: 'one\ntwo' }]
          : [{ data: 'one' }, { data: 'two' }],
    });
  }
}
framingCases.push(
  {
    name: 'controls take effect before a message boundary and EOF',
    bytes: encode(
      'retry: 7\nretry: invalid\nretry: 0\r\nretry-max: 100\rkeepalive: 250\ndata: unfinished\nretry: 99',
    ),
    controls: [
      { retry: '7' },
      { retry: '0' },
      { 'retry-max': '100' },
      { keepalive: '250' },
    ],
    events: [],
    incomplete: true,
  },
  {
    name: 'invalid fields cannot replace valid fields and empty event type resets',
    bytes: encode(
      'id: kept\nid: bad\0id\nretry: 7\nretry: invalid\nevent: named\nevent:\ndata: first\n\nid:\nretry: 0\nretry: -1\ndata: reset\n\n',
    ),
    controls: [{ retry: '7' }, { retry: '0' }],
    events: [
      { id: 'kept', event: '', data: 'first' },
      { id: '', data: 'reset' },
    ],
  },
  {
    name: 'split Unicode',
    bytes: encode('data: café☕🚀\r\n\r\ndata: done\n\n'),
    events: [{ data: 'café☕🚀' }, { data: 'done' }],
  },
  {
    name: 'BOM at stream start and in data',
    bytes: encode('\ufeffdata: first\n\ndata: \ufeffsecond\n\n'),
    events: [{ data: 'first' }, { data: '\ufeffsecond' }],
  },
  {
    name: 'only one leading BOM is removed',
    bytes: encode('\ufeff\ufeffdata: ignored\n\ndata: last\n\n'),
    events: [{ data: 'last' }],
  },
  {
    name: 'empty data and multiple lines',
    bytes: encode('data\r\rdata:\ndata: \r\rdata:  space\n\n'),
    events: [{ data: '' }, { data: '\n' }, { data: ' space' }],
  },
  {
    name: 'comment heartbeat and controls',
    controls: [
      { retry: '60000' },
      { keepalive: '10000' },
      { 'retry-max': '60000' },
    ],
    // Firefox's native EventSource drops IDs on control-only frames. Sunday is checked against
    // the explicit spec-derived expectation; only payloads use native comparison for this case.
    nativePayloadOnly: true,
    bytes: encode(
      ': ping\n\nretry: 60000\nkeepalive: 10000\nretry-max: 60000\nid: kept\n\ndata: final\n\n',
    ),
    events: [{ id: 'kept' }, { data: 'final' }],
  },
);
for (const [name, invalid, replacement] of [
  ['incomplete two-byte sequence', [0xc2], '�'],
  ['incomplete three-byte sequence', [0xe2], '�'],
  ['incomplete four-byte sequence', [0xf0, 0x9f], '�'],
  ['unexpected continuation', [0x80], '�'],
  ['overlong sequence', [0xc0, 0xaf], '��'],
  ['surrogate', [0xed, 0xa0, 0x80], '���'],
]) {
  framingCases.push({
    name,
    bytes: new Uint8Array([
      ...encode('data: '),
      ...invalid,
      ...encode('\n\ndata: two\n\n'),
    ]),
    events: [{ data: replacement }, { data: 'two' }],
  });
}
framingCases.push(
  {
    name: 'unfinished event at EOF',
    bytes: encode('data: complete\n\ndata: incomplete\n'),
    events: [{ data: 'complete' }],
    incomplete: true,
  },
  {
    name: 'unfinished UTF-8 at EOF',
    bytes: new Uint8Array([...encode('data: complete\n\ndata: '), 0xf0, 0x9f]),
    events: [{ data: 'complete' }],
    incomplete: true,
  },
);
