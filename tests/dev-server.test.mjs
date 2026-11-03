import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createDevServer } from '../src/dev-server.mjs';

/**
 * Send a raw HTTP/1.1 request so malformed request targets and Host headers
 * reach the server unchanged (http.request would validate or rewrite them).
 */
function rawRequest(port, raw) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    socket.setEncoding('utf8');
    // A listener that throws before responding leaves the socket open; fail fast instead of hanging.
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error('no response within 2s'));
    });
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
    socket.write(raw);
  });
}

function statusCodeOf(response) {
  return Number(response.split('\r\n', 1)[0].split(' ')[1]);
}

/**
 * Run `node dev-server.mjs` from src/ (the Docker development stage invocation) on an
 * ephemeral port and resolve with the address and port its startup line reports.
 */
function startMain(extraEnv) {
  const env = { ...process.env, PORT: '0', ...extraEnv };
  if (!('DEV_SERVER_HOST' in extraEnv)) delete env.DEV_SERVER_HOST;
  const child = spawn(process.execPath, ['dev-server.mjs'], { cwd: new URL('../src/', import.meta.url), env });
  const exited = new Promise((resolve) => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  };
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const fail = async (message) => {
      clearTimeout(timer);
      await stop();
      reject(new Error(`${message}\nstdout: ${out}\nstderr: ${err}`));
    };
    const timer = setTimeout(() => fail('no startup line within 5s'), 5000);
    child.on('error', (error) => fail(`spawn failed: ${error.message}`));
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/Dev server running at http:\/\/localhost:(\d+) \(bound to ([^)]+)\)/);
      if (match) {
        clearTimeout(timer);
        child.removeAllListeners('exit');
        resolve({ port: Number(match[1]), address: match[2], stop });
      }
    });
    child.once('exit', (code) => fail(`exited early with ${code}`));
  });
}

describe('dev server', () => {
  let server;
  let port;

  before(async () => {
    server = createDevServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('answers 200 on /status even when the Host header is not a valid host', async () => {
    const response = await rawRequest(port, 'GET /status HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');
    assert.strictEqual(statusCodeOf(response), 200);
  });

  it('answers 400 on a request target that cannot be parsed as a URL', async () => {
    const response = await rawRequest(port, 'GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    assert.strictEqual(statusCodeOf(response), 400);
  });

  it('stays alive and keeps serving after malformed requests', async () => {
    const bad = await rawRequest(port, 'GET // HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');
    assert.strictEqual(statusCodeOf(bad), 400);
    assert.ok(server.listening, 'server should still be listening');
    const response = await rawRequest(port, 'GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    assert.strictEqual(statusCodeOf(response), 200);
  });

  it('answers 404 on an unknown path', async () => {
    const response = await rawRequest(port, 'GET /nope HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    assert.strictEqual(statusCodeOf(response), 404);
  });

  it('listens on 127.0.0.1 by default when run as the main module', async () => {
    const child = await startMain({});
    try {
      assert.strictEqual(child.address, '127.0.0.1');
      const response = await rawRequest(child.port, 'GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      assert.strictEqual(statusCodeOf(response), 200);
    } finally {
      await child.stop();
    }
  });

  it('listens on DEV_SERVER_HOST when it is set', async () => {
    const child = await startMain({ DEV_SERVER_HOST: '0.0.0.0' });
    try {
      assert.strictEqual(child.address, '0.0.0.0');
    } finally {
      await child.stop();
    }
  });
});
