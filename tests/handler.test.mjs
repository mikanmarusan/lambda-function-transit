import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { splitRoutes, handler, extractJsRedirect, isAllowedUrl, buildDepartureParams, buildSearchUrl } from '../src/index.mjs';

// Mock HTML block matching real Jorudan format (■ for terminal, ◇ for transfer stations)
const mockBlock = `発着時間：06:30発 → 08:45着\r\n所要時間：2時間15分\r\n乗換回数：2回\r\n\r\n■六本木一丁目    1番線発\r\n｜ 　東京メトロ南北線(浦和美園行)   3.1km\r\n｜06:30-06:36［6分］\r\n｜178円\r\n◇永田町    3番線着・1番線発 ［乗換4分+待ち4分］\r\n｜ 　東京メトロ半蔵門線(中央林間行)   5.7km\r\n｜06:44-06:53［9分］\r\n｜ ↓\r\n◇渋谷    1番線着・1番線発 ［乗換6分+待ち4分］\r\n｜ 　京王井の頭線(吉祥寺行)   12.5km\r\n｜07:03-07:20［17分］\r\n｜230円\r\n■つつじヶ丘（東京）    1・2番線着`;

// Second mock block for multiple candidates testing
const mockBlock2 = `発着時間：07:00発 → 09:00着\r\n所要時間：2時間\r\n乗換回数：1回\r\n\r\n■新宿    1番線発\r\n｜ 　京王線(京王八王子行)   12.5km\r\n｜07:00-07:20［20分］\r\n｜230円\r\n■つつじヶ丘（東京）    1・2番線着`;

// Third mock block (with mockBlock4, one of the four candidates that prove the MAX_CANDIDATES cap)
const mockBlock3 = `発着時間：08:00発 → 10:00着\r\n所要時間：2時間\r\n乗換回数：0回\r\n\r\n■渋谷    1番線発\r\n｜ 　京王井の頭線(吉祥寺行)   4.9km\r\n｜08:00-08:10［10分］\r\n■明大前    1番線着`;

// Combined blocks for multiple candidates
const mockMultipleBlocks = `${mockBlock}${mockBlock2}`;

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

describe('splitRoutes', () => {
  it('should split multiple routes correctly', () => {
    const routes = splitRoutes(mockMultipleBlocks);
    assert.strictEqual(routes.length, 2, 'Should return 2 routes');
  });

  it('should return array for single route', () => {
    const routes = splitRoutes(mockBlock);
    assert.strictEqual(routes.length, 1, 'Should return 1 route');
    assert.ok(routes[0].includes('06:30発 → 08:45着'), 'Should contain first route data');
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

describe('buildDepartureParams (JST now + walk minutes)', () => {
  const CASES = [
    ['2026-10-01T11:51:00+09:00', 11, 'Dym=202610&Ddd=1&Dhh=12&Dmn=2'],
    ['2026-10-01T23:55:00+09:00', 11, 'Dym=202610&Ddd=2&Dhh=0&Dmn=6'],
    ['2026-10-31T23:55:00+09:00', 11, 'Dym=202611&Ddd=1&Dhh=0&Dmn=6'],
    ['2026-12-31T23:55:00+09:00', 11, 'Dym=202701&Ddd=1&Dhh=0&Dmn=6'],
    ['2026-10-01T23:49:00+09:00', 11, 'Dym=202610&Ddd=2&Dhh=0&Dmn=0'],
  ];

  for (const [iso, walk, expected] of CASES) {
    it(`${iso} + ${walk}min -> ${expected}`, () => {
      assert.strictEqual(buildDepartureParams(new Date(iso), walk), expected);
    });
  }

  it('gives the same results regardless of the process time zone', () => {
    const moduleUrl = new URL('../src/index.mjs', import.meta.url).href;
    const script = `
      const { buildDepartureParams } = await import(${JSON.stringify(moduleUrl)});
      const cases = ${JSON.stringify(CASES)};
      process.stdout.write(JSON.stringify(cases.map(([iso, walk]) => buildDepartureParams(new Date(iso), walk))));
    `;
    const expected = CASES.map(([, , params]) => params);
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      assert.deepStrictEqual(JSON.parse(out), expected, `TZ=${tz}`);
    }
  });
});

describe('buildSearchUrl', () => {
  it('keeps Cway=0 and appends the JST departure params to the encoded origin URL', () => {
    const url = buildSearchUrl('麻布十番', 11, new Date('2026-10-01T11:51:00+09:00'));
    assert.ok(url.startsWith('https://www.jorudan.co.jp/norikae/cgi/nori.cgi?'));
    assert.ok(url.includes('eki1=%E9%BA%BB%E5%B8%83%E5%8D%81%E7%95%AA&'), 'origin must be percent-encoded');
    assert.ok(url.includes('&Cway=0&'), 'depart-at mode must be kept');
    assert.ok(url.endsWith('&Dym=202610&Ddd=1&Dhh=12&Dmn=2'));
    assert.ok(isAllowedUrl(url, url), 'search URL must pass the SSRF guard');
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
      assert.strictEqual(body.routes, undefined, 'the legacy routes field is removed');
      assert.ok(body.origins.length > 0, 'Should have at least one origin');
      assert.ok(body.origins[0].origin, 'First origin should have origin label');
      assert.ok(body.origins[0].candidates.length > 0, 'First origin should have candidates');
      assert.ok(body.destination, 'Should have destination label');
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

  it('searches each origin from JST now + its walk minutes', async () => {
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T11:51:00+09:00') });
    try {
      const calls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (url) => { calls.push(url); return createMockResponse(validHtml); });
      try {
        const result = await handler({}, {});
        assert.strictEqual(result.statusCode, 200);
      } finally {
        globalThis.fetch = originalFetch;
      }
      const expected = [
        ['%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE', 'Dym=202610&Ddd=1&Dhh=11&Dmn=55'],
        ['%E7%A5%9E%E8%B0%B7%E7%94%BA', 'Dym=202610&Ddd=1&Dhh=11&Dmn=58'],
        ['%E9%BA%BB%E5%B8%83%E5%8D%81%E7%95%AA', 'Dym=202610&Ddd=1&Dhh=12&Dmn=2'],
      ];
      for (const [encodedOrigin, params] of expected) {
        const call = calls.find(u => u.includes(`eki1=${encodedOrigin}&`));
        assert.ok(call, `origin ${encodedOrigin} should be searched`);
        assert.ok(call.endsWith(`&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t&${params}`), call);
      }
    } finally {
      mock.timers.reset();
    }
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
      const { candidates } = body.origins[0];
      assert.strictEqual(candidates.length, 2, 'Should have 2 candidates per origin');
      assert.ok(candidates[0].departureAt.includes('T06:30:00'), 'Should contain first route time');
      assert.ok(candidates[1].departureAt.includes('T07:00:00'), 'Should contain second route time');
    });
  });

  it('returns 200 with no_candidates origins and fastestOrigin null when no route is found', async () => {
    await runWithMockedFetch(createMockResponse(buildHtml('no routes here')), async () => {
      const result = await handler({}, {});
      assert.strictEqual(result.statusCode, 200, 'a page with no route is not a failure');
      const body = JSON.parse(result.body);
      assert.strictEqual(body.routes, undefined, 'the legacy routes field is removed');
      assert.strictEqual(body.fastestOrigin, null);
      assert.deepStrictEqual(body.origins.map(o => o.status), ['no_candidates', 'no_candidates', 'no_candidates']);
      for (const o of body.origins) assert.deepStrictEqual(o.candidates, []);
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

  it('should return exactly the generatedAt, destination, fastestOrigin and origins keys', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      const body = JSON.parse(result.body);
      assert.deepStrictEqual(Object.keys(body).sort(), ['destination', 'fastestOrigin', 'generatedAt', 'origins']);
    });
  });

  it('should return 3 origins in config order', async () => {
    await runWithMockedFetch(createMockResponse(validHtml), async () => {
      const result = await handler({}, {});
      const body = JSON.parse(result.body);
      assert.deepStrictEqual(body.origins.map(o => o.origin), ['六本木一丁目', '神谷町', '麻布十番']);
    });
  });
});

describe('handler — structured origins field', () => {
  const KAMIYACHO_EKI1 = '%E7%A5%9E%E8%B0%B7%E7%94%BA';
  // Fourth block, arriving last, to prove the MAX_CANDIDATES (3) cap.
  const mockBlock4 = `発着時間：08:10発 → 11:00着\r\n所要時間：2時間50分\r\n乗換回数：0回\r\n\r\n■新宿    3番線発\r\n｜ 　［私鉄］京王線各停(高幡不動行)   12.5km   後方\r\n｜ 　08:10-11:00［170分］\r\n■つつじヶ丘（東京）    1・2番線着`;
  // Jorudan order is not arrival order: 10:00, 09:00, 11:00, 08:45.
  const unsortedHtml = `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${mockBlock3}${mockBlock2}${mockBlock4}${mockBlock}<hr size="1" color="black" />block3`;
  // Arrives 07:30, earlier than any candidate of unsortedHtml.
  const earlyBlock = `発着時間：06:40発 → 07:30着\r\n所要時間：50分\r\n乗換回数：1回\r\n\r\n■神谷町    1番線発\r\n｜ 　［地下鉄］東京メトロ日比谷線(中目黒行)   1.5km   後／1号車\r\n｜ 　06:40-06:43［3分］\r\n◇六本木    1番線着・2番線発 ［乗換6分+待ち2分］\r\n｜ 　［地下鉄］都営大江戸線都庁前経由(光が丘行)   4.6km   3・8号車\r\n｜ 　06:51-07:30［39分］\r\n■つつじヶ丘（東京）    1・2番線着`;
  const earlyHtml = `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${earlyBlock}<hr size="1" color="black" />block3`;

  const buildHtmlFrom = (blocks) => `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${blocks}<hr size="1" color="black" />`;

  async function runAt(iso, fetchFn) {
    mock.timers.enable({ apis: ['Date'], now: new Date(iso) });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(fetchFn);
    try {
      const result = await handler({ path: '/api/transit' }, {});
      return { result, body: JSON.parse(result.body) };
    } finally {
      globalThis.fetch = originalFetch;
      mock.timers.reset();
    }
  }

  it('returns generatedAt, destination, fastestOrigin and per-origin results', async () => {
    const { result, body } = await runAt('2026-10-01T06:20:30+09:00', async () => createMockResponse(unsortedHtml));
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(body.generatedAt, '2026-10-01T06:20:30+09:00');
    assert.strictEqual(body.destination, 'つつじヶ丘（東京）');
    assert.strictEqual(body.fastestOrigin, '六本木一丁目', 'ties go to config order');
    assert.deepStrictEqual(
      body.origins.map(o => [o.origin, o.walkMinutes, o.status, o.searchedFrom]),
      [
        ['六本木一丁目', 4, 'ok', '2026-10-01T06:24:00+09:00'],
        ['神谷町', 7, 'ok', '2026-10-01T06:27:00+09:00'],
        ['麻布十番', 11, 'ok', '2026-10-01T06:31:00+09:00'],
      ],
    );
  });

  it('keeps at most 3 candidates per origin, sorted by arrival, with isFastest / isFewestTransfers', async () => {
    const { body } = await runAt('2026-10-01T06:20:00+09:00', async () => createMockResponse(unsortedHtml));
    const { candidates } = body.origins[0];
    assert.deepStrictEqual(candidates.map(c => c.arrivalAt), [
      '2026-10-01T08:45:00+09:00',
      '2026-10-01T09:00:00+09:00',
      '2026-10-01T10:00:00+09:00',
    ]);
    assert.deepStrictEqual(candidates.map(c => c.isFastest), [true, false, false]);
    assert.deepStrictEqual(candidates.map(c => c.isFewestTransfers), [false, false, true]);
    const first = candidates[0];
    assert.strictEqual(first.departureAt, '2026-10-01T06:30:00+09:00');
    assert.strictEqual(first.durationMinutes, 135);
    assert.strictEqual(first.transferCount, 2);
    assert.strictEqual(first.stops.length, first.legs.length + 1);
    assert.deepStrictEqual(
      first.legs.map(l => [l.lineCode, l.departAt, l.arriveAt]),
      [
        ['N', '2026-10-01T06:30:00+09:00', '2026-10-01T06:36:00+09:00'],
        ['Z', '2026-10-01T06:44:00+09:00', '2026-10-01T06:53:00+09:00'],
        [null, '2026-10-01T07:03:00+09:00', '2026-10-01T07:20:00+09:00'],
      ],
    );
  });

  it('names the origin whose best candidate arrives first as fastestOrigin', async () => {
    const { body } = await runAt('2026-10-01T06:20:00+09:00', async (url) =>
      createMockResponse(url.includes(`eki1=${KAMIYACHO_EKI1}&`) ? earlyHtml : unsortedHtml));
    assert.strictEqual(body.fastestOrigin, '神谷町');
    const kamiyacho = body.origins.find(o => o.origin === '神谷町');
    assert.deepStrictEqual(kamiyacho.candidates[0].legs.map(l => [l.lineCode, l.via]), [['H', null], ['E', '都庁前']]);
  });

  it('marks an origin whose fetch fails as error and still answers 200', async () => {
    const { result, body } = await runAt('2026-10-01T06:20:00+09:00', async (url) =>
      (url.includes(`eki1=${KAMIYACHO_EKI1}&`) ? createMockResponse('only one block') : createMockResponse(unsortedHtml)));
    assert.strictEqual(result.statusCode, 200);
    const kamiyacho = body.origins.find(o => o.origin === '神谷町');
    assert.strictEqual(kamiyacho.status, 'error');
    assert.deepStrictEqual(kamiyacho.candidates, []);
    assert.deepStrictEqual(body.origins.map(o => o.status), ['ok', 'error', 'ok']);
  });

  it('marks an origin whose route blocks all fail to parse as error', async () => {
    const malformedHtml = 'block0<hr size="1" color="black" />block1<hr size="1" color="black" />発着時間：\r\n\r\n<hr size="1" color="black" />';
    const { body } = await runAt('2026-10-01T06:20:00+09:00', async (url) =>
      createMockResponse(url.includes(`eki1=${KAMIYACHO_EKI1}&`) ? malformedHtml : unsortedHtml));
    assert.strictEqual(body.origins.find(o => o.origin === '神谷町').status, 'error');
  });

  it('returns fastestOrigin null when origins are only no_candidates or error', async () => {
    const { result, body } = await runAt('2026-10-01T06:20:00+09:00', async (url) =>
      createMockResponse(url.includes(`eki1=${KAMIYACHO_EKI1}&`)
        ? 'block0<hr size="1" color="black" />block1<hr size="1" color="black" />no routes<hr size="1" color="black" />'
        : 'only one block'));
    assert.strictEqual(result.statusCode, 200);
    assert.deepStrictEqual(body.origins.map(o => o.status), ['error', 'no_candidates', 'error']);
    assert.strictEqual(body.fastestOrigin, null);
  });

  it('returns 500 when the structured parse fails at every origin', async () => {
    // Jorudan markup drift the strict parser rejects (a summary whose duration
    // disagrees with its times): with no legacy field left, nothing can be served.
    const driftedHtml = buildHtmlFrom(mockBlock.replace('所要時間：2時間15分', '所要時間：3時間'));
    const { result, body } = await runAt('2026-10-01T06:20:00+09:00', async () => createMockResponse(driftedHtml));
    assert.strictEqual(result.statusCode, 500);
    assert.ok(body.error);
  });

  it('returns 500 when every origin is error', async () => {
    const { result, body } = await runAt('2026-10-01T06:20:00+09:00', async () => createMockResponse('only one block'));
    assert.strictEqual(result.statusCode, 500);
    assert.ok(body.error);
    assert.strictEqual(body.origins, undefined);
  });

  it('resolves a leg that crosses midnight to a next-day arriveAt', async () => {
    const lateBlock = `発着時間：23:50発 → 00:20着\r\n所要時間：30分\r\n乗換回数：0回\r\n\r\n■六本木一丁目    1番線発 \r\n｜ 　［地下鉄］東京メトロ南北線(浦和美園行)   3.1km   3・6号車\r\n｜ 　23:50-00:20［30分］\r\n■つつじヶ丘（東京）    1・2番線着 `;
    const lateHtml = `block0<hr size="1" color="black" />block1<hr size="1" color="black" />${lateBlock}<hr size="1" color="black" />`;
    const { body } = await runAt('2026-10-31T23:40:00+09:00', async () => createMockResponse(lateHtml));
    const leg = body.origins[0].candidates[0].legs[0];
    assert.strictEqual(leg.departAt, '2026-10-31T23:50:00+09:00');
    assert.strictEqual(leg.arriveAt, '2026-11-01T00:20:00+09:00');
    assert.strictEqual(body.origins[0].candidates[0].arrivalAt, '2026-11-01T00:20:00+09:00');
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
      assert.deepStrictEqual(data.origins.map(o => o.status), ['ok', 'ok', 'ok'], 'all 3 origins should succeed');
      assert.ok(data.origins[0].candidates.length > 0, 'should have parsed candidates');
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
      assert.deepStrictEqual(data.origins.map(o => o.status), ['error', 'ok', 'ok'], 'two origins should still succeed');
      const failed = data.origins.find(o => o.origin === '六本木一丁目');
      assert.strictEqual(failed.status, 'error', 'failed origin is reported as error in origins');
      assert.deepStrictEqual(failed.candidates, []);
      assert.strictEqual(data.fastestOrigin, '神谷町');
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
