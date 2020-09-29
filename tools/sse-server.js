import http from 'http';

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

  let itAlive = setInterval(function () {
    if (res.writableEnded) {
      return;
    }
    console.log('Pinging');
    res.write(':ping\n\n');
  }, aliveInterval);

  res.on('close', () => {
    clearInterval(itAlive);
  });

  return {
    cancelPings: function cancelPings() {
      clearTimeout(itAlive);
    },
    sendField: function sendField(field, value) {
      res.write(`${field}: ${value}\n\n`);
    },
    sendEvent: function sendEvent(id, event, data) {
      if (res.writableEnded) {
        return false;
      }

      if (id) {
        res.write('id: ' + id + '\n');
      }
      if (event) {
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

export default function server(cb) {
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
}
