import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getSummary, getRoute, splitRoutes, handler } from '../src/index.mjs';

// Mock HTML block similar to Jorudan's response
const mockBlock = `発着時間：06:30～08:45\r\n所要時間：2時間15分\r\n乗換回数：2回\r\n\r\n六本木一丁目\r\n｜ 　東京メトロ南北線\r\n永田町\r\n｜ 　東京メトロ半蔵門線\r\n渋谷\r\n｜ 　京王井の頭線\r\nつつじヶ丘（東京）`;

// Second mock block for multiple candidates testing
const mockBlock2 = `発着時間：07:00～09:00\r\n所要時間：2時間\r\n乗換回数：1回\r\n\r\n新宿\r\n｜ 　京王線\r\nつつじヶ丘（東京）`;

// Third mock block for MAX_CANDIDATES testing
const mockBlock3 = `発着時間：08:00～10:00\r\n所要時間：2時間\r\n乗換回数：0回\r\n\r\n渋谷\r\n｜ 　京王井の頭線\r\n明大前`;

// Combined blocks for multiple candidates
const mockMultipleBlocks = `${mockBlock}${mockBlock2}`;
const mockThreeBlocks = `${mockBlock}${mockBlock2}${mockBlock3}`;

// Helper to create mock headers
function createMockHeaders(data = {}) {
  return {
    get: (key) => data[key.toLowerCase()] || null,
  };
}

// Helper to run handler with mocked fetch
async function runWithMockedFetch(response, testFn) {
  const mockFetch = mock.fn(async () => response);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await testFn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Helper to create a standard successful response
function createMockResponse(html) {
  return {
    ok: true,
    text: async () => html,
    headers: createMockHeaders({}),
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

describe('splitRoutes', () => {
  it('should split multiple routes correctly', () => {
    const routes = splitRoutes(mockMultipleBlocks);
    assert.strictEqual(routes.length, 2, 'Should return 2 routes');
  });

  it('should return array for single route', () => {
    const routes = splitRoutes(mockBlock);
    assert.strictEqual(routes.length, 1, 'Should return 1 route');
    assert.ok(routes[0].includes('06:30～08:45'), 'Should contain first route data');
  });

  it('should return empty array for empty string', () => {
    const routes = splitRoutes('');
    assert.strictEqual(routes.length, 0, 'Should return empty array');
  });

  it('should return empty array when no 発着時間 found', () => {
    const routes = splitRoutes('some random text without routes');
    assert.strictEqual(routes.length, 0, 'Should return empty array');
  });

  it('should filter out empty strings', () => {
    const routes = splitRoutes('   \n  ' + mockBlock);
    assert.strictEqual(routes.length, 1, 'Should filter whitespace-only entries');
  });
});

describe('handler', () => {
  // Helper to build HTML with route blocks
  function buildHtml(routeContent) {
    return `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${routeContent}<hr size="1" color="black" />block3`;
  }

  const validHtml = buildHtml(mockBlock);

  it('should return statusCode 200 on success', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');
      assert.ok(result.body, 'Should have body');

      const body = JSON.parse(result.body);
      assert.ok(Array.isArray(body.transfers), 'Should have transfers array');
    });
  });

  it('should return error on JavaScript redirect (bot detection)', async () => {
    const redirectPage = '<!DOCTYPE html><script>function rdr(){window.location.href="/webuser/set-uuid.cgi?url=/test"}</script>';

    await runWithMockedFetch(createMockResponse(redirectPage), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on bot detection');

      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    });
  });

  it('should return statusCode 500 on unexpected HTML structure', async () => {
    await runWithMockedFetch(createMockResponse('only one block'), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500');

      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    });
  });

  it('should have correct content-type header', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.headers['Content-Type'], 'application/json', 'Should have JSON content type');
    });
  });

  it('should reject SSRF attempt via protocol in redirect path', async () => {
    const ssrfRedirectPage = '<!DOCTYPE html><script>function rdr(){window.location.href="//evil.com/steal"}</script>';

    await runWithMockedFetch(createMockResponse(ssrfRedirectPage), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on SSRF attempt');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    });
  });

  it('should handle HTTP error status codes', async () => {
    const errorResponse = {
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
      headers: createMockHeaders({}),
    };

    await runWithMockedFetch(errorResponse, async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on HTTP error');
    });
  });

  it('should return multiple candidates when available', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml(mockMultipleBlocks)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');

      const body = JSON.parse(result.body);
      assert.strictEqual(body.transfers.length, 2, 'Should return 2 candidates');
      assert.ok(body.transfers[0][0].includes('06:30～08:45'), 'First candidate should have first route time');
      assert.ok(body.transfers[1][0].includes('07:00～09:00'), 'Second candidate should have second route time');
    });
  });

  it('should limit candidates to MAX_CANDIDATES (2)', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml(mockThreeBlocks)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');

      const body = JSON.parse(result.body);
      assert.strictEqual(body.transfers.length, 2, 'Should return only 2 candidates even when 3 available');
    });
  });

  it('should return error when no transit routes found', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml('no routes here')), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 when no routes found');

      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    });
  });

  it('should filter out malformed route data', async () => {
    const malformedBlock = `発着時間：\r\n\r\n`;

    await runWithMockedFetch(createMockResponse(buildHtml(malformedBlock)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 for malformed route data');

      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error message');
    });
  });
});
