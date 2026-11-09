// Browser test entrypoint exposes the parser submodule without changing the package's root exports.
export * from '../../src/index.js';
export { EventParser } from '../../src/event-parser.js';
