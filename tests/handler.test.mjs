import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getSummary, getRoute, handler } from '../src/index.mjs';

// Mock HTML block similar to Jorudan's response
const mockBlock = `発着時間：06:30～08:45\r\n所要時間：2時間15分\r\n乗換回数：2回\r\n\r\n六本木一丁目\r\n｜ 　東京メトロ南北線\r\n永田町\r\n｜ 　東京メトロ半蔵門線\r\n渋谷\r\n｜ 　京王井の頭線\r\nつつじヶ丘（東京）`;

// Helper to create mock headers
function createMockHeaders(data = {}) {
  return {
    get: (key) => data[key.toLowerCase()] || null,
  };
}

describe('getSummary', () => {
  it('should extract arrival and departure time', () => {
    const summary = getSummary(mockBlock);
    assert.ok(summary.includes('06:30～08:45'), 'Should contain arrival/departure time');
  });

  it('should extract required time', () => {
    const summary = getSummary(mockBlock);
    assert.ok(summary.includes('2時間15分'), 'Should contain required time');
  });

  it('should extract transfer count', () => {
    const summary = getSummary(mockBlock);
    assert.ok(summary.includes('2回'), 'Should contain transfer count');
  });

  it('should format summary correctly', () => {
    const summary = getSummary(mockBlock);
    assert.match(summary, /.*\(.*\)\(.*\)/, 'Should match format: time(duration)(transfers)');
  });

  it('should handle empty block', () => {
    const summary = getSummary('');
    assert.strictEqual(typeof summary, 'string', 'Should return a string');
  });
});

describe('getRoute', () => {
  it('should extract route information', () => {
    const route = getRoute(mockBlock);
    assert.ok(route.includes('六本木一丁目'), 'Should contain start station');
    assert.ok(route.includes('つつじヶ丘（東京）'), 'Should contain end station');
  });

  it('should remove extra spaces from separator', () => {
    const blockWithSpaces = `summary\r\n\r\n六本木一丁目\r\n｜ 　test`;
    const route = getRoute(blockWithSpaces);
    assert.ok(!route.includes('｜ 　'), 'Should not contain "｜ 　"');
  });

  it('should handle empty block', () => {
    const route = getRoute('');
    assert.strictEqual(typeof route, 'string', 'Should return a string');
  });
});

describe('handler', () => {
  const validHtml = `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${mockBlock}<hr size="1" color="black" />block3`;

  it('should return statusCode 200 on success', async () => {
    // Mock fetch that returns valid HTML directly (no redirect)
    const mockFetch = mock.fn(async () => ({
      ok: true,
      text: async () => validHtml,
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');
      assert.ok(result.body, 'Should have body');

      const body = JSON.parse(result.body);
      assert.ok(Array.isArray(body.transfers), 'Should have transfers array');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return error on JavaScript redirect (bot detection)', async () => {
    const redirectPage = '<!DOCTYPE html><script>function rdr(){window.location.href="/webuser/set-uuid.cgi?url=/test"}</script>';

    const mockFetch = mock.fn(async () => ({
      ok: true,
      text: async () => redirectPage,
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on bot detection');

      const body = JSON.parse(result.body);
      // Error message is now generic for security
      assert.ok(body.error, 'Should have error message');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should return statusCode 500 on unexpected HTML structure', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      text: async () => 'only one block',
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500');

      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should have correct content-type header', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      text: async () => validHtml,
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.headers['Content-Type'], 'application/json', 'Should have JSON content type');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should reject SSRF attempt via protocol in redirect path', async () => {
    // Malicious redirect attempting to escape to another domain
    const ssrfRedirectPage = '<!DOCTYPE html><script>function rdr(){window.location.href="//evil.com/steal"}</script>';

    const mockFetch = mock.fn(async () => ({
      ok: true,
      text: async () => ssrfRedirectPage,
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on SSRF attempt');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should handle HTTP error status codes', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
      headers: createMockHeaders({}),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on HTTP error');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
