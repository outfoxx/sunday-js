import { strict as assert } from 'node:assert';
import { TaggedValue } from 'cbor-redux';
import { z } from 'zod';

const rootModule = await import('@outfoxx/sunday');
const nullifyModule = await import('@outfoxx/sunday/util/nullify');

assert.ok(rootModule, 'expected root module import to succeed');
assert.equal(typeof rootModule.FetchTransport, 'function', 'expected FetchTransport export');
assert.equal(typeof rootModule.nullifyProblem, 'function', 'expected nullifyProblem root export');

assert.ok(nullifyModule, 'expected subpath module import to succeed');
assert.equal(typeof nullifyModule.nullifyProblem, 'function', 'expected subpath nullifyProblem export');
assert.equal(typeof nullifyModule.nullifyNotFound, 'function', 'expected subpath nullifyNotFound export');

const { ArrayBufferSchema, ArrayBufferEncoding, createSchemaRuntime, DateEncoding, NumericDateDecoding } = rootModule;
const bytes = Uint8Array.of(0, 127, 128, 254, 255);
const policy = {
  dateEncoding: DateEncoding.ISO8601,
  numericDateDecoding: NumericDateDecoding.DECIMAL_SECONDS_SINCE_EPOCH,
};
for (const format of ['json', 'cbor']) {
  for (const [arrayBufferEncoding, tag, text] of [
    [ArrayBufferEncoding.BASE64, 34, 'AH+A/v8'],
    [ArrayBufferEncoding.BASE64URL, 33, 'AH-A_v8'],
  ]) {
    const schema = createSchemaRuntime({ ...policy, format, arrayBufferEncoding }).resolveSchema(ArrayBufferSchema);
    assert.deepEqual(new Uint8Array(schema.parse(text)), bytes);
    const encoded = z.encode(schema, bytes.buffer);
    assert.equal(format === 'json' ? encoded : encoded.value, text);
    if (format === 'cbor') {
      assert.equal(encoded.tag, tag);
      assert.deepEqual(new Uint8Array(schema.parse(new TaggedValue('AH+A/v8=', 34))), bytes);
      assert.deepEqual(new Uint8Array(schema.parse(new TaggedValue('AH-A_v8=', 33))), bytes);
    }
    assert.throws(() => schema.parse('invalid!'), SyntaxError);
  }
}
const template = new rootModule.URLTemplate('https://example.com/items{/id}');
assert.equal(template.complete('', { id: '' }).href, 'https://example.com/items/');
assert.equal(template.complete('', { id: null }).href, 'https://example.com/items');
assert.equal(template.complete('', {}).href, 'https://example.com/items');
assert.equal(template.complete('', { id: [''] }).href, 'https://example.com/items/');

const { ResponseExample } = await import('@outfoxx/sunday/fetch');
const [excerpt, body] = await ResponseExample.bodyExcerpt(new Response(bytes), 100);
assert.equal(excerpt, 'AH+A/v8');
assert.ok(body instanceof Blob);
assert.deepEqual(new Uint8Array(await body.arrayBuffer()), bytes);

console.log('ESM imports, URI templates, binary codecs, and response excerpts succeeded');
