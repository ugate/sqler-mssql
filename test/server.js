'use strict';

const http = require('http');
const Fs = require('fs');
const Path = require('path');

const hostname = '0.0.0.0';
const port = 80;
const dir = Path.resolve(__dirname, '../');

const server = http.createServer((req, res) => {
  if (req.url === '/healthcheck') {
    res.writeHead(200);
    res.end('healthy');
    return;
  }

  const url = req.url === '/' ? '/index.html' : req.url.replace(/\.\.\//g, '');
  const file = Path.join(dir, 'docs', url);

  console.log(`Serving docs request: ${req.url} from: ${file}`);

  Fs.readFile(file, (err, data) => {
    if (err) {
      console.error(`Failed to find docs file: ${file}`, err);
      res.writeHead(404);
      res.end(JSON.stringify(err));
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(port, hostname, () => {
  console.log(`Serving docs at http://${hostname}:${port}/`);
});