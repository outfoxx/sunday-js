import { strict as assert } from 'node:assert';

const rootModule = await import('@outfoxx/sunday');
const nullifyModule = await import('@outfoxx/sunday/util/nullify');

assert.ok(rootModule, 'expected root module import to succeed');
assert.equal(typeof rootModule.FetchRequestFactory, 'function', 'expected FetchRequestFactory export');
assert.equal(typeof rootModule.nullifyProblem, 'function', 'expected nullifyProblem root export');

assert.ok(nullifyModule, 'expected subpath module import to succeed');
assert.equal(typeof nullifyModule.nullifyProblem, 'function', 'expected subpath nullifyProblem export');
assert.equal(typeof nullifyModule.nullifyNotFound, 'function', 'expected subpath nullifyNotFound export');

console.log('ESM smoke imports succeeded');
