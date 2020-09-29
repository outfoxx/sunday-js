#! node
import SSEServer from './sse-server.js';

SSEServer((client) => {
  let id = 0;
  console.log('Opened');
  const sendMsg = () => {
    console.log('Sending Message');
    const writable = client.sendEvent(
      ++id,
      'msg',
      '{"id":"313412341", "content":"Hello World!"}'
    );
    if (!writable) {
      return;
    }

    if (Math.random() > 0.2) {
      setTimeout(sendMsg, 3000);
    } else {
      console.log('Stopping');
    }
  };
  setTimeout(sendMsg, 1000);
});
