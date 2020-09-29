#! node
import SSEServer from './sse-server.js';

SSEServer((client) => {
  console.log('Opened');
  client.sendEvent(null, 'rdy', '{}');
  setTimeout(() => client.cancelPings(), 200 * 1000);
});
