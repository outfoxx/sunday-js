import { Observable } from 'rxjs';
import { fromStreamReader } from './stream-rxjs-webstreams';

export function fromStream(stream: ReadableStream): Observable<ArrayBuffer> {
  if (typeof stream.getReader !== 'function') {
    return require('./stream-rxjs-node').fromNative(stream);
  }
  return fromStreamReader(stream);
}
