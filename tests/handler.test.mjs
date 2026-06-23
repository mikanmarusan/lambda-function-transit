import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { getSummary, getRoute, splitRoutes, handler, extractJsRedirect, isAllowedUrl } from '../src/index.mjs';

// Mock HTML block matching real Jorudan format (■ for terminal, ◇ for transfer stations)
const mockBlock = `発着時間：06:30～08:45\r\n所要時間：2時間15分\r\n乗換回数：2回\r\n\r\n■六本木一丁目    1番線発\r\n｜ 　東京メトロ南北線(浦和美園行)   3.1km\r\n｜06:30-06:36［6分］\r\n｜178円\r\n◇永田町    3番線着・1番線発 ［乗換4分+待ち4分］\r\n｜ 　東京メトロ半蔵門線(中央林間行)   5.7km\r\n｜06:44-06:53［9分］\r\n｜ ↓\r\n◇渋谷    1番線着・1番線発 ［乗換6分+待ち4分］\r\n｜ 　京王井の頭線(吉祥寺行)   12.5km\r\n｜07:03-07:20［17分］\r\n｜230円\r\n■つつじヶ丘（東京）    1・2番線着`;

// Second mock block for multiple candidates testing
const mockBlock2 = `発着時間：07:00～09:00\r\n所要時間：2時間\r\n乗換回数：1回\r\n\r\n■新宿    1番線発\r\n｜ 　京王線(京王八王子行)   12.5km\r\n｜07:00-07:20［20分］\r\n｜230円\r\n■つつじヶ丘（東京）    1・2番線着`;

// Third mock block for MAX_CANDIDATES testing
const mockBlock3 = `発着時間：08:00～10:00\r\n所要時間：2時間\r\n乗換回数：0回\r\n\r\n■渋谷    1番線発\r\n｜ 　京王井の頭線(吉祥寺行)   4.9km\r\n｜08:00-08:10［10分］\r\n■明大前    1番線着`;

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

// Helper to run handler with sequenced fetch responses
async function runWithSequencedFetch(responses, testFn) {
  let callIndex = 0;
  const mockFetch = mock.fn(async () => {
    const response = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return response;
  });
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
  it('should extract terminal stations', () => {
    const route = getRoute(mockBlock);
    assert.ok(route.includes('■六本木一丁目'), 'Should contain start station');
    assert.ok(route.includes('■つつじヶ丘（東京）'), 'Should contain end station');
  });

  it('should preserve intermediate transfer stations (◇)', () => {
    const route = getRoute(mockBlock);
    assert.ok(route.includes('◇永田町'), 'Should contain transfer station 永田町');
    assert.ok(route.includes('◇渋谷'), 'Should contain transfer station 渋谷');
  });

  it('should keep line names and filter out times, fares, arrows', () => {
    const route = getRoute(mockBlock);
    // Line names should be kept
    assert.ok(route.includes('東京メトロ南北線'), 'Should contain line name');
    assert.ok(route.includes('東京メトロ半蔵門線'), 'Should contain line name');
    assert.ok(route.includes('京王井の頭線'), 'Should contain line name');
    // Times, fares, arrows should be filtered out
    assert.ok(!route.includes('06:30-06:36'), 'Should not contain time info');
    assert.ok(!route.includes('178円'), 'Should not contain fare info');
    assert.ok(!route.includes('↓'), 'Should not contain arrow');
  });

  it('should produce correct number of lines for multi-transfer route', () => {
    const route = getRoute(mockBlock);
    const lines = route.split('\n');
    // 4 stations (■x2 + ◇x2) + 3 line names = 7 lines
    assert.strictEqual(lines.length, 7, 'Should have 7 lines (4 stations + 3 line names)');
  });

  it('should remove extra spaces from separator', () => {
    const blockWithSpaces = `summary\r\n\r\n■六本木一丁目\r\n｜ 　test`;
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

describe('extractJsRedirect', () => {
  const JID = 'https://jid.jorudan.co.jp/jrd_uuid/?returl=abc';

  it('should extract a single-quoted absolute redirect (the new Jorudan form)', () => {
    const body = `<script>function rdr(){window.location.href='${JID}';}rdr();</script>`;
    assert.strictEqual(extractJsRedirect(body), JID);
  });

  it('should extract a double-quoted redirect (defensive, in case Jorudan reverts)', () => {
    const body = `<script>window.location.href="${JID}"</script>`;
    assert.strictEqual(extractJsRedirect(body), JID);
  });

  it('should extract a relative redirect string verbatim (validation deferred)', () => {
    const body = `<script>window.location.href='/webuser/set-uuid.cgi?url=/x'</script>`;
    assert.strictEqual(extractJsRedirect(body), '/webuser/set-uuid.cgi?url=/x');
  });

  it('should return null when no window.location.href is present', () => {
    assert.strictEqual(extractJsRedirect('<html>no redirect here</html>'), null);
  });

  it('should be ReDoS-safe on a pathological unterminated-quote body', () => {
    const body = `<script>window.location.href='${'a'.repeat(100000)}`;
    const start = process.hrtime.bigint();
    const result = extractJsRedirect(body);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    assert.strictEqual(result, null, 'unterminated quote should not match');
    assert.ok(elapsedMs < 100, `should return quickly (took ${elapsedMs}ms)`);
  });
});

describe('isAllowedUrl SSRF guard', () => {
  const BASE = 'https://www.jorudan.co.jp/norikae/cgi/nori.cgi';

  it('should accept https www.jorudan.co.jp', () => {
    assert.strictEqual(isAllowedUrl('https://www.jorudan.co.jp/x')?.hostname, 'www.jorudan.co.jp');
  });

  it('should accept https jid.jorudan.co.jp', () => {
    assert.strictEqual(isAllowedUrl('https://jid.jorudan.co.jp/jrd_uuid/')?.hostname, 'jid.jorudan.co.jp');
  });

  it('should resolve and accept a relative reference against an allowed base', () => {
    assert.strictEqual(isAllowedUrl('./set_uuid.cgi?returl=abc', 'https://jid.jorudan.co.jp/jrd_uuid/?returl=abc')?.hostname, 'jid.jorudan.co.jp');
  });

  it('should reject an off-allowlist host', () => {
    assert.strictEqual(isAllowedUrl('https://evil.com/steal'), null);
  });

  it('should reject a look-alike suffix host (exact match, not substring)', () => {
    assert.strictEqual(isAllowedUrl('https://jorudan.co.jp.evil.com/'), null);
    assert.strictEqual(isAllowedUrl('https://www.jorudan.co.jp.evil.com/'), null);
  });

  it('should reject the bare apex jorudan.co.jp (not in allowlist)', () => {
    assert.strictEqual(isAllowedUrl('https://jorudan.co.jp/'), null);
  });

  it('should reject http (TLS downgrade), including the metadata IP', () => {
    assert.strictEqual(isAllowedUrl('http://www.jorudan.co.jp/'), null);
    assert.strictEqual(isAllowedUrl('http://169.254.169.254/latest/meta-data/'), null);
  });

  it('should reject credentials embedded in the URL', () => {
    assert.strictEqual(isAllowedUrl('https://www.jorudan.co.jp@evil.com/'), null);
    assert.strictEqual(isAllowedUrl('https://user:pass@www.jorudan.co.jp/'), null);
  });

  it('should reject data:, javascript:, file:, ftp: schemes', () => {
    assert.strictEqual(isAllowedUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.strictEqual(isAllowedUrl('javascript:alert(1)'), null);
    assert.strictEqual(isAllowedUrl('JavaScript:alert(1)'), null);
    assert.strictEqual(isAllowedUrl('file:///etc/passwd'), null);
    assert.strictEqual(isAllowedUrl('ftp://attacker.example/'), null);
  });

  it('should reject protocol-relative // references resolved off-allowlist', () => {
    assert.strictEqual(isAllowedUrl('//evil.com/path', BASE), null);
  });

  it('should return null on unparseable input', () => {
    assert.strictEqual(isAllowedUrl('not a url'), null);
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
      assert.ok(body.routes, 'Should have routes array');
      assert.ok(body.routes.length > 0, 'Should have at least one origin route');
      assert.ok(body.routes[0].transfers, 'First origin should have transfers');
      assert.ok(body.routes[0].origin, 'First origin should have origin label');
      assert.ok(body.routes[0].destination, 'First origin should have destination label');
    });
  });

  it('should return error on JavaScript redirect (bot detection)', async () => {
    const redirectPage = '<!DOCTYPE html><script>function rdr(){window.location.href="/webuser/set-uuid.cgi?url=/test"}</script>';

    await runWithMockedFetch(createMockResponse(redirectPage), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on bot detection');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error in response');
    });
  });

  it('should return statusCode 500 on unexpected HTML structure', async () => {
    await runWithMockedFetch(createMockResponse('only one block'), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error in response');
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
      assert.ok(body.error, 'Should have error in response');
    });
  });

  it('should reject SSRF attempt via absolute URL in Location header', async () => {
    // Step 1: Initial request returns JS redirect page
    const jsRedirectPage = '<!DOCTYPE html><script>window.location.href="/webuser/set-uuid.cgi?url=/test"</script>';
    const response1 = createMockResponse(jsRedirectPage);

    // Step 2: UUID redirect returns absolute URL pointing to malicious domain
    const response2 = {
      ok: true,
      text: async () => '',
      headers: createMockHeaders({
        location: 'https://evil.com/steal',
        'set-cookie': 'uuid=test123',
      }),
    };

    await runWithSequencedFetch([response1, response2], async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 on SSRF attempt via Location header');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error in response');
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

  it('should return multiple candidates per origin when available', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml(mockMultipleBlocks)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');
      const body = JSON.parse(result.body);
      const firstOrigin = body.routes[0];
      assert.strictEqual(firstOrigin.transfers.length, 2, 'Should have 2 transfers per origin');
      assert.ok(firstOrigin.transfers[0][0].includes('06:30'), 'Should contain first route time');
      assert.ok(firstOrigin.transfers[1][0].includes('07:00'), 'Should contain second route time');
    });
  });

  it('should limit candidates to MAX_CANDIDATES (2) per origin', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml(mockThreeBlocks)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'Should return status 200');
      const body = JSON.parse(result.body);
      assert.strictEqual(body.routes[0].transfers.length, 2, 'Should have only 2 transfers per origin');
    });
  });

  it('should return error when no transit routes found', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml('no routes here')), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 when no routes found');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error in response');
    });
  });

  it('should filter out malformed route data', async () => {
    const malformedBlock = `発着時間：\r\n\r\n`;

    await runWithMockedFetch(createMockResponse(buildHtml(malformedBlock)), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 500, 'Should return status 500 for malformed route data');
      const body = JSON.parse(result.body);
      assert.ok(body.error, 'Should have error in response');
    });
  });

  it('should return routes array with origin, destination, and transfers', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      const body = JSON.parse(result.body);
      assert.ok(Array.isArray(body.routes), 'routes should be an array');
      assert.ok(body.routes.length > 0, 'routes should have at least one origin');
      const firstOrigin = body.routes[0];
      assert.ok(typeof firstOrigin.origin === 'string', 'origin should be a string');
      assert.ok(typeof firstOrigin.destination === 'string', 'destination should be a string');
      assert.ok(Array.isArray(firstOrigin.transfers), 'transfers should be an array');
      assert.ok(firstOrigin.transfers.length > 0, 'transfers should have at least one element');
      assert.ok(Array.isArray(firstOrigin.transfers[0]), 'Each transfer should be an array');
      assert.strictEqual(firstOrigin.transfers[0].length, 2, 'Each transfer should have 2 elements [summary, route]');
    });
  });

  it('should return 3 origin routes', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      const body = JSON.parse(result.body);
      assert.strictEqual(body.routes.length, 3, 'Should have 3 origin routes');
      assert.strictEqual(body.routes[0].origin, '六本木一丁目');
      assert.strictEqual(body.routes[1].origin, '神谷町');
      assert.strictEqual(body.routes[2].origin, '麻布十番');
    });
  });
});

describe('handler — full jrd_uuid handshake (URL-keyed cookie-stateful router mock)', () => {
  const JID = 'https://jid.jorudan.co.jp/jrd_uuid/?returl=https%3A%2F%2Fwww.jorudan.co.jp%2Fwebuser%2Fredirect2.cgi%3Furl%3Dx';
  const REDIRECT2 = 'https://www.jorudan.co.jp/webuser/redirect2.cgi?url=%2Fnorikae%2Fcgi%2Fnori.cgi%3Ffinal%3D1';
  const ROPPONGI_EKI1 = '%E5%85%AD%E6%9C%AC%E6%9C%A8'; // unique to the 六本木一丁目 origin
  const redirectPage = `<!DOCTYPE html><script>function rdr(){window.location.href='${JID}';}rdr();</script>`;
  const transitHtml = `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${mockBlock}<hr size="1" color="black" />block3`;

  function res({ status = 200, body = '', setCookie = [], location = null }) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (k) => (k.toLowerCase() === 'location' ? location : null),
        getSetCookie: () => setCookie,
      },
      text: async () => body,
    };
  }

  function makeRouter(calls, opts = {}) {
    const verifyBody = opts.verifyBody ?? REDIRECT2;
    return mock.fn(async (url, init = {}) => {
      const cookie = (init.headers && init.headers.Cookie) || '';
      const method = init.method || 'GET';
      calls.push({ url, method, headers: init.headers || {}, body: init.body });
      if (url.includes('set_uuid.cgi')) {
        // Jorudan answers a non-POST (no fingerprint body) with 403 ("./error.html").
        if (method !== 'POST') return res({ status: 403, body: './error.html' });
        return res({ setCookie: ['jrd_cuid=CUID;path=/jrd_uuid/;max-age=30;Domain=jid.jorudan.co.jp;Secure;HttpOnly'] });
      }
      if (url.includes('verify_uuid.cgi')) {
        if (method !== 'POST') return res({ status: 403, body: './error.html' });
        if (!cookie.includes('jrd_cuid')) return res({ body: './error.html' });
        return res({ body: verifyBody, setCookie: ['jrd_uuid=UUID;path=/;max-age=31536000;Domain=.jorudan.co.jp;Secure;HttpOnly'] });
      }
      if (url.includes('/jrd_uuid/')) return res({ body: '<html>jid page</html>' }); // hop 2
      if (url.includes('redirect2.cgi')) return res({ status: 302, location: '/norikae/cgi/nori.cgi?final=1' });
      // nori.cgi: hop 1 (no jrd_uuid) returns the redirect page; hop 6 (jrd_uuid present) returns transit data
      if (opts.failOrigin && url.includes(opts.failOrigin) && !cookie.includes('jrd_uuid')) {
        return res({ body: 'broken: no redirect and no transit data' });
      }
      return cookie.includes('jrd_uuid') ? res({ body: transitHtml }) : res({ body: redirectPage });
    });
  }

  async function withRouter(opts, testFn) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = makeRouter(calls, opts);
    try {
      return await testFn(calls);
    } finally {
      globalThis.fetch = original;
    }
  }

  it('completes the 6-hop flow and returns 200 with 3 origins', async () => {
    await withRouter({}, async () => {
      const result = await handler({ path: '/transit' }, {});
      assert.strictEqual(result.statusCode, 200);
      const data = JSON.parse(result.body);
      assert.strictEqual(data.routes.length, 3, 'all 3 origins should succeed');
      assert.ok(data.routes[0].transfers.length > 0, 'should have parsed transfers');
    });
  });

  it('sends AJAX headers (Accept */*, Sec-Fetch-Site, jid origin-root Referer) to set_uuid', async () => {
    await withRouter({}, async (calls) => {
      await handler({ path: '/transit' }, {});
      const ajaxCall = calls.find(c => c.url.includes('set_uuid.cgi'));
      assert.ok(ajaxCall, 'set_uuid.cgi should be called');
      assert.strictEqual(ajaxCall.headers.Accept, '*/*');
      assert.strictEqual(ajaxCall.headers['Sec-Fetch-Site'], 'same-origin');
      assert.strictEqual(ajaxCall.headers.Referer, 'https://jid.jorudan.co.jp/', 'Referer should be the jid origin root');
    });
  });

  it('POSTs set_uuid/verify_uuid with the urlencoded fingerprint body and a ts query param', async () => {
    await withRouter({}, async (calls) => {
      await handler({ path: '/transit' }, {});
      for (const cgi of ['set_uuid.cgi', 'verify_uuid.cgi']) {
        const ajaxCall = calls.find(c => c.url.includes(cgi));
        assert.ok(ajaxCall, `${cgi} should be called`);
        assert.strictEqual(ajaxCall.method, 'POST', `${cgi} must be a POST`);
        assert.ok(
          ajaxCall.headers['Content-Type'].includes('application/x-www-form-urlencoded'),
          `${cgi} must send a form-urlencoded Content-Type`,
        );
        const params = new URLSearchParams(ajaxCall.body);
        for (const key of ['tz', 'lang', 'sw', 'sh', 'cd', 'mem', 'hc', 'ua', 'ts']) {
          assert.ok(params.has(key), `${cgi} body must carry fingerprint field "${key}"`);
        }
        assert.ok(/[?&]ts=/.test(ajaxCall.url), `${cgi} URL must carry a ts query param`);
      }
    });
  });

  it('hops 1/2/5/6 stay GET with no body (only the AJAX hops are POSTs)', async () => {
    await withRouter({}, async (calls) => {
      await handler({ path: '/transit' }, {});
      const nonAjax = calls.filter(c => !c.url.includes('set_uuid.cgi') && !c.url.includes('verify_uuid.cgi'));
      assert.ok(nonAjax.length > 0, 'non-AJAX hops should be recorded');
      for (const c of nonAjax) {
        assert.strictEqual(c.method, 'GET', `non-AJAX hop ${c.url} must remain GET`);
        assert.strictEqual(c.body, undefined, `non-AJAX hop ${c.url} must not carry a body`);
      }
    });
  });

  it('returns 500 when set_uuid is issued as GET at every origin (regression lock)', async () => {
    // Force every set_uuid to be a GET by patching fetch to drop the method,
    // proving the mock's 403-on-GET guard surfaces as an all-origins failure.
    const calls = [];
    const original = globalThis.fetch;
    const router = makeRouter(calls, {});
    globalThis.fetch = mock.fn((url, init = {}) => {
      if (typeof url === 'string' && (url.includes('set_uuid.cgi') || url.includes('verify_uuid.cgi'))) {
        return router(url, { ...init, method: 'GET' });
      }
      return router(url, init);
    });
    try {
      const result = await handler({ path: '/transit' }, {});
      assert.strictEqual(result.statusCode, 500, 'GET-based AJAX hops must fail every origin -> 500');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('sends domain-scoped jrd_uuid to the final www request but never the jid-only jrd_cuid', async () => {
    await withRouter({}, async (calls) => {
      await handler({ path: '/transit' }, {});
      const finalCall = calls.find(c => c.url.includes('nori.cgi?final=1'));
      assert.ok(finalCall, 'final nori.cgi should be called');
      assert.ok(finalCall.headers.Cookie.includes('jrd_uuid'), 'shared parent-domain cookie should reach www');
      assert.ok(!finalCall.headers.Cookie.includes('jrd_cuid'), 'jid-host-scoped cookie must not leak to www');
    });
  });

  it('returns 200 with the surviving origins when one origin fails (partial success)', async () => {
    await withRouter({ failOrigin: ROPPONGI_EKI1 }, async () => {
      const result = await handler({ path: '/transit' }, {});
      assert.strictEqual(result.statusCode, 200);
      const data = JSON.parse(result.body);
      assert.strictEqual(data.routes.length, 2, 'two origins should still succeed');
      assert.ok(!data.routes.some(r => r.origin === '六本木一丁目'), 'failed origin should be absent');
    });
  });

  it('rejects an off-allowlist verify_uuid result (SSRF to metadata IP) -> 500', async () => {
    await withRouter({ verifyBody: 'http://169.254.169.254/latest/meta-data/' }, async () => {
      const result = await handler({ path: '/transit' }, {});
      assert.strictEqual(result.statusCode, 500, 'metadata-IP final URL must be rejected at every origin');
    });
  });
});

describe('/status endpoint', () => {
  it('should return status 200 with JSON response', async () => {
    const result = await handler({ path: '/status' }, {});
    assert.strictEqual(result.statusCode, 200, 'Should return status 200');
    assert.strictEqual(result.headers['Content-Type'], 'application/json', 'Should have JSON content type');
  });

  it('should return ok status in body', async () => {
    const result = await handler({ path: '/status' }, {});
    const body = JSON.parse(result.body);
    assert.strictEqual(body.status, 'ok', 'Should have status ok');
  });

  it('should include timestamp in response', async () => {
    const result = await handler({ path: '/status' }, {});
    const body = JSON.parse(result.body);
    assert.ok(body.timestamp, 'Should have timestamp');
    assert.ok(!isNaN(Date.parse(body.timestamp)), 'Timestamp should be valid ISO date');
  });

  it('should handle rawPath for API Gateway v2', async () => {
    const result = await handler({ rawPath: '/status' }, {});
    assert.strictEqual(result.statusCode, 200, 'Should return status 200');
    const body = JSON.parse(result.body);
    assert.strictEqual(body.status, 'ok', 'Should have status ok');
  });
});

describe('CORS headers', () => {
  it('should advertise only Content-Type in Access-Control-Allow-Headers', async () => {
    const result = await handler({ path: '/status' }, {});
    assert.strictEqual(
      result.headers['Access-Control-Allow-Headers'],
      'Content-Type',
      'Allow-Headers should not include Authorization since no auth is implemented'
    );
  });

  it('should set wildcard Access-Control-Allow-Origin', async () => {
    const result = await handler({ path: '/status' }, {});
    assert.strictEqual(result.headers['Access-Control-Allow-Origin'], '*');
  });

  it('should allow only GET and OPTIONS methods', async () => {
    const result = await handler({ path: '/status' }, {});
    assert.strictEqual(result.headers['Access-Control-Allow-Methods'], 'GET,OPTIONS');
  });

  it('should set X-Content-Type-Options to nosniff', async () => {
    const result = await handler({ path: '/status' }, {});
    assert.strictEqual(result.headers['X-Content-Type-Options'], 'nosniff');
  });
});
