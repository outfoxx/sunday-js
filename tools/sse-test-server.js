#! node
import http from 'http';

let itAlive = null;

const SSE = function SSE(req, res) {
  const aliveInterval = 60000;

  req.socket.setNoDelay(true);

  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'last-event-id',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  itAlive = setInterval(function () {
    if (res.writableEnded) {
      return;
    }
    res.write(':ping\n\n');
  }, aliveInterval);

  res.on('close', () => {
    clearInterval(itAlive);
  });

  return {
    send: function send(id, event, data) {
      if (res.writableEnded) {
        return false;
      }

      if (id) {
        res.write('id: ' + id + '\n');
      }
      if (id) {
        res.write('event: ' + event + '\n');
      }
      res.write('data: ' + data + '\n\n');

      return true;
    },
    close: function close(callback) {
      res.end(callback);
    },
  };
};

const server = function server(cb) {
  const PORT = process.env.PORT || 5555;

  const server = http.createServer(function (req, res) {
    if (req.url !== '/stream') return res.end();

    const client = SSE(req, res);

    cb(client);
  });

  server.listen(PORT, function () {
    console.log('SSE FAKE SERVER');
    console.log('Server running, listening at port ' + PORT + '.');
  });
};

server((client) => {
  let id = 0;
  console.log('Opened');
  client.send(++id, 'rdy', JSON.stringify(['rdy', 'msg', 'dlv']));
  const sendEvent = () => {
    console.log('Sending Message');
    const writable = client.send(
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
      setTimeout(sendEvent, 2200);
    }
  };
  setTimeout(sendEvent, 1200);
});
