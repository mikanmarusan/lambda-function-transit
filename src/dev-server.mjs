/**
 * Development HTTP server for local testing
 * Allows GET requests to /transit and /status endpoints
 */
import http from 'http';
import { realpathSync } from 'fs';
import { fileURLToPath } from 'url';
import { handler } from './index.mjs';

const PORT = process.env.PORT || 8000;
// Loopback by default; the Docker dev image sets DEV_SERVER_HOST=0.0.0.0 so the published port works.
const HOST = process.env.DEV_SERVER_HOST || '127.0.0.1';

/**
 * Create the dev server without listening, so tests can bind it to an ephemeral port.
 * @returns {http.Server}
 */
export function createDevServer() {
  return http.createServer(async (req, res) => {
    let path;
    try {
      // Constant base: the client-supplied Host header never reaches the URL parser.
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

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
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  const server = createDevServer();
  server.listen(PORT, HOST, () => {
    const { address, port } = server.address();
    console.log(`Dev server running at http://localhost:${port} (bound to ${address})`);
    console.log(`  - GET /transit  - Transit information`);
    console.log(`  - GET /status   - Health check`);
  });
}
