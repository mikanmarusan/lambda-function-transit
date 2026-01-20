/**
 * Development HTTP server for local testing
 * Allows GET requests to /transit and /status endpoints
 */
import http from 'http';
import { handler } from './index.mjs';

const PORT = process.env.PORT || 8000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/status') {
    try {
      const result = await handler({ path: '/status' }, {});
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (error) {
      console.error('Handler error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  } else if (req.method === 'GET' && path === '/transit') {
    try {
      const result = await handler({ path: '/transit' }, {});
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } catch (error) {
      console.error('Handler error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`  - GET /transit  - Transit information`);
  console.log(`  - GET /status   - Health check`);
});
