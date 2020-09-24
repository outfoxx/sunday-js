import { Observable } from 'rxjs';
import { fromWebStream } from './stream-rxjs-webstreams';

export function fromStream(stream: ReadableStream): Observable<ArrayBuffer> {
  if (typeof stream.getReader !== 'function') {
    return require('./stream-rxjs-node').fromNodeStream(stream);
  }
  return fromWebStream(stream);
}
