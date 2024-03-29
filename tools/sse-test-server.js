#! node
import SSEServer from './sse-server.js';

SSEServer((client) => {
  let id = 0;
  console.log('Opened');
  client.sendField('timeout', 90000);
  client.sendField('retry', 100);
  client.sendEvent(++id, 'rdy', JSON.stringify(['rdy', 'msg', 'dlv']));
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

    if (Math.random() < 0.1) {
      console.log('Closing');
      client.close();
    } else {
      setTimeout(sendMsg, 2200);
    }
  };
  setTimeout(sendMsg, 1200);
});
