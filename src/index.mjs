/**
 * AWS Lambda function to fetch transit information from Jorudan
 * Migrated from Python to Node.js 24
 */

import { parseCandidate, rankCandidates, pickFastestOrigin, toJstIso } from './parse.mjs';

const JORUDAN_BASE_URL = 'https://www.jorudan.co.jp';
const JORUDAN_URL_PREFIX = `${JORUDAN_BASE_URL}/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=`;
const JORUDAN_URL_SUFFIX = '&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t';
const JORUDAN_DESTINATION = 'つつじヶ丘（東京）';
// Walk minutes from the office to each origin station (placeholder values; tune here only).
// Each search starts from "JST now + walkMinutes" so every returned candidate is catchable.
const JORUDAN_ORIGINS = [
  { origin: '六本木一丁目', walkMinutes: 4 },
  { origin: '神谷町',       walkMinutes: 7 },
  { origin: '麻布十番',     walkMinutes: 11 },
];
// Lambda runs in UTC, so JST is computed explicitly rather than from the process time zone.
const JST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});
const PER_HOP_TIMEOUT_MS = 2500;   // per-fetch timeout for a single hop
const OVERALL_BUDGET_MS = 7000;    // total budget for one origin's full handshake
const ALLOWED_HOSTS = new Set(['www.jorudan.co.jp', 'jid.jorudan.co.jp']);
const MIN_EXPECTED_BLOCKS = 3;
const TARGET_BLOCK_INDEX = 2;  // Third block contains route information
const MAX_CANDIDATES = 3;  // Candidates per origin in the structured `origins` field

/**
 * Build Jorudan's departure date/time query parameters for "now + walkMinutes" in JST.
 * Built from numbers only; never from request input.
 * @param {Date} now - Current instant
 * @param {number} walkMinutes - Minutes to walk to the origin station
 * @returns {string} `Dym=YYYYMM&Ddd=D&Dhh=H&Dmn=M`
 */
export function buildDepartureParams(now, walkMinutes) {
  const departure = new Date(now.getTime() + walkMinutes * 60_000);
  const parts = Object.fromEntries(
    JST_FORMATTER.formatToParts(departure).map(({ type, value }) => [type, value])
  );
  return `Dym=${parts.year}${parts.month}&Ddd=${Number(parts.day)}&Dhh=${Number(parts.hour)}&Dmn=${Number(parts.minute)}`;
}

/**
 * Build the Jorudan search URL for one origin, departing at JST now + walkMinutes.
 * @param {string} origin - Origin station name
 * @param {number} walkMinutes - Minutes to walk to the origin station
 * @param {Date} now - Current instant
 * @returns {string} Search URL
 */
export function buildSearchUrl(origin, walkMinutes, now) {
  return `${JORUDAN_URL_PREFIX}${encodeURIComponent(origin)}${JORUDAN_URL_SUFFIX}&${buildDepartureParams(now, walkMinutes)}`;
}

/**
 * Split target block into individual routes
 * @param {string} block - HTML block containing all routes
 * @returns {string[]} Array of individual route blocks
 */
export function splitRoutes(block) {
  return block.split(/(?=発着時間：)/).filter(r => r.trim() && r.includes('発着時間：'));
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Referer': 'https://www.jorudan.co.jp/',
};

/**
 * Static browser fingerprint posted (urlencoded) to set_uuid/verify_uuid.
 * Jorudan now expects these AJAX hops to be POSTs carrying the browser's
 * environment fingerprint; a bare GET is answered with 403 ("./error.html").
 * Values mirror a real desktop Chrome session; `ua` is derived from
 * BROWSER_HEADERS so the fingerprint cannot drift internally inconsistent.
 * Only `ts` (a page-uptime seconds value) is appended dynamically.
 */
const FINGERPRINT_FIELDS = {
  tz: 'Asia/Tokyo',
  lang: 'ja',
  sw: '1470',
  sh: '956',
  cd: '30',
  mem: '16',
  hc: '8',
  ua: BROWSER_HEADERS['User-Agent'],
};

/**
 * Build the urlencoded fingerprint body for the set_uuid/verify_uuid POSTs.
 * @returns {string} application/x-www-form-urlencoded body
 */
function buildFingerprintBody() {
  const params = new URLSearchParams(FINGERPRINT_FIELDS);
  params.set('ts', '171.5');  // page-uptime seconds; static value accepted by Jorudan
  return params.toString();
}

/**
 * Extract the redirect target from a Jorudan JavaScript redirect page.
 * Handles both single- and double-quoted `window.location.href` assignments and
 * returns the raw URL string (which is now a legitimate absolute cross-host URL
 * to jid.jorudan.co.jp). Host/scheme validation is deferred to isAllowedUrl().
 * The negated character class `[^'"]+` cannot backtrack, so this is ReDoS-safe.
 * @param {string} body - HTML body containing the JS redirect
 * @returns {string|null} Redirect URL string or null
 */
export function extractJsRedirect(body) {
  const match = body.match(/window\.location\.href\s*=\s*(['"])([^'"]+)\1/);
  if (!match) return null;
  return match[2].trim() || null;
}

/**
 * SSRF guard: resolve a URL and accept it only if it targets an allowlisted
 * Jorudan host over https. Single chokepoint called before every hop, and on
 * the plaintext verify_uuid result. Rejects non-https schemes (data:,
 * javascript:, file:, ftp:, protocol-relative //), credentials in the URL, and
 * any host outside ALLOWED_HOSTS (exact hostname match — no substring/suffix).
 * @param {string} rawUrl - URL or relative reference to validate
 * @param {string} [baseUrl] - Base for resolving a relative reference
 * @returns {URL|null} Parsed URL when allowed, otherwise null
 */
export function isAllowedUrl(rawUrl, baseUrl) {
  let u;
  try {
    u = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  return u;
}

/**
 * Split a folded Set-Cookie header string into individual cookie lines.
 * Fallback for environments (and test mocks) where Headers.getSetCookie() is
 * unavailable; the lookahead avoids splitting on commas inside Expires dates.
 * @param {string|null} setCookieHeader - Raw set-cookie header value
 * @returns {string[]} Individual Set-Cookie strings
 */
function legacySplitSetCookie(setCookieHeader) {
  if (!setCookieHeader) return [];
  return setCookieHeader.split(/,(?=\s*\w+=)/).map(s => s.trim()).filter(Boolean);
}

/**
 * Minimal cookie jar with Domain-attribute scoping (browser-faithful).
 * A cookie with `Domain=.jorudan.co.jp` is shared across allowed subdomains
 * (so jid-set jrd_uuid reaches the final www request); a cookie with no Domain
 * is host-only (so jid-scoped jrd_cuid never leaks to www).
 */
class CookieJar {
  #byHost = new Map();    // exact host -> Map(name -> value)
  #byDomain = new Map();  // registrable domain (no leading dot) -> Map(name -> value)

  store(headers, requestHost) {
    const lines = headers.getSetCookie?.() ?? legacySplitSetCookie(headers.get?.('set-cookie'));
    for (const line of lines) {
      if (!line) continue;
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      let domain = null;
      for (const attr of attrs) {
        const ai = attr.indexOf('=');
        if (ai > 0 && attr.slice(0, ai).trim().toLowerCase() === 'domain') {
          domain = attr.slice(ai + 1).trim().replace(/^\./, '').toLowerCase();
        }
      }
      const bucket = domain ? this.#byDomain : this.#byHost;
      const key = domain || requestHost.toLowerCase();
      if (!bucket.has(key)) bucket.set(key, new Map());
      bucket.get(key).set(name, value);
    }
  }

  headerFor(host) {
    const h = host.toLowerCase();
    const merged = new Map();
    for (const [domain, cookies] of this.#byDomain) {
      if (h === domain || h.endsWith(`.${domain}`)) {
        for (const [n, v] of cookies) merged.set(n, v);
      }
    }
    const hostCookies = this.#byHost.get(h);
    if (hostCookies) for (const [n, v] of hostCookies) merged.set(n, v);
    return [...merged].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}

/**
 * Headers that mimic the browser's `fetch()` AJAX calls to set_uuid/verify_uuid.
 * Jorudan returns 403 (body "./error.html") without these.
 * @param {string} refererUrl - The jid page URL that "issued" the AJAX call
 * @returns {Object} Header map
 */
function buildAjaxHeaders(refererUrl) {
  return {
    'User-Agent': BROWSER_HEADERS['User-Agent'],
    'Accept': '*/*',
    'Accept-Language': BROWSER_HEADERS['Accept-Language'],
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'Referer': refererUrl,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
}

/**
 * fetch() bounded by both a per-hop timeout and the remaining origin budget.
 * @param {string} url - URL to fetch
 * @param {Object} opts - { headers, redirect, method, body }
 * @param {number} deadline - Date.now() epoch ms after which the origin budget is spent
 * @returns {Promise<Response>}
 */
function fetchWithBudget(url, { headers, redirect = 'manual', method = 'GET', body }, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Origin budget exhausted');
  return fetch(url, {
    method,
    headers,
    redirect,
    ...(body !== undefined ? { body } : {}),
    signal: AbortSignal.timeout(Math.min(PER_HOP_TIMEOUT_MS, remaining)),
  });
}

/**
 * Run Jorudan's jrd_uuid bot-check handshake for one origin and return the
 * final transit HTML. Six hops: nori -> jid page -> set_uuid -> verify_uuid ->
 * redirect2 -> nori. Every hop's URL is host-validated; cookies are accumulated
 * with Domain-attribute scoping; the whole chain is bounded by OVERALL_BUDGET_MS.
 * @param {string} originUrl - The initial nori.cgi search URL
 * @returns {Promise<string>} Transit results HTML
 */
async function performBotHandshake(originUrl) {
  const jar = new CookieJar();
  const deadline = Date.now() + OVERALL_BUDGET_MS;

  const get = async (urlObj, headers, redirect, opts = {}) => {
    const cookie = jar.headerFor(urlObj.hostname);
    const res = await fetchWithBudget(
      urlObj.href,
      { headers: cookie ? { ...headers, Cookie: cookie } : headers, redirect, ...opts },
      deadline,
    );
    jar.store(res.headers, urlObj.hostname);
    return res;
  };

  // Hop 1: initial nori.cgi request
  const origin = isAllowedUrl(originUrl);
  if (!origin) throw new Error('Origin URL not allowed');
  const r1 = await get(origin, BROWSER_HEADERS, 'manual');
  const body1 = await r1.text();

  // Fast path: already authorized (warm cookies, or a direct results page)
  if (body1.includes('<hr size="1"')) return body1;

  const jidRaw = extractJsRedirect(body1);
  const jidUrl = jidRaw && isAllowedUrl(jidRaw, origin.href);
  if (!jidUrl) throw new Error('Bot check: no valid jid redirect');

  // Hop 2: jid page (the JS here drives the AJAX handshake in a real browser)
  const r2 = await get(jidUrl, BROWSER_HEADERS, 'manual');
  await r2.text();

  // The AJAX endpoints share the jid page's querystring (?returl=...) plus a
  // `ts` epoch cache-buster. `ts` is appended before isAllowedUrl so the SSRF
  // chokepoint validates the exact URL that is fetched.
  const tsParam = `ts=${Date.now() / 1000}`;
  const sep = jidUrl.search ? '&' : '?';
  const setUrl = isAllowedUrl(`./set_uuid.cgi${jidUrl.search}${sep}${tsParam}`, jidUrl.href);
  const verifyUrl = isAllowedUrl(`./verify_uuid.cgi${jidUrl.search}${sep}${tsParam}`, jidUrl.href);
  if (!setUrl || !verifyUrl) throw new Error('Bot check: derived UUID URL not allowed');
  // Real-browser Referer for these AJAX calls is the jid origin root, not the jid page URL.
  const ajaxHeaders = buildAjaxHeaders(`${jidUrl.origin}/`);
  // Jorudan now requires set_uuid/verify_uuid to be POSTs carrying the fingerprint body.
  const fpBody = buildFingerprintBody();

  // Hop 3: set_uuid.cgi -> Set-Cookie jrd_cuid (jid-scoped)
  const r3 = await get(setUrl, ajaxHeaders, 'manual', { method: 'POST', body: fpBody });
  if (!r3.ok) throw new Error(`set_uuid failed: ${r3.status}`);

  // Hop 4: verify_uuid.cgi -> plaintext final redirect URL (and Set-Cookie jrd_uuid)
  const r4 = await get(verifyUrl, ajaxHeaders, 'manual', { method: 'POST', body: fpBody });
  if (!r4.ok) throw new Error(`verify_uuid failed: ${r4.status}`);
  const finalRaw = (await r4.text()).trim();
  if (!finalRaw || finalRaw.length > 2048 || /\s/.test(finalRaw)) {
    throw new Error('Bot check: invalid verify_uuid body');
  }
  const redirect2Url = isAllowedUrl(finalRaw);
  if (!redirect2Url) throw new Error('Bot check: verify_uuid result not allowed');

  // Hop 5: redirect2.cgi -> 302 to nori.cgi
  const r5 = await get(redirect2Url, BROWSER_HEADERS, 'manual');
  const location = r5.headers.get('location');
  const transitUrl = location && isAllowedUrl(location, redirect2Url.href);
  if (!transitUrl) throw new Error('Bot check: invalid post-redirect location');

  // Hop 6: final transit page (carries jrd_uuid via Domain=.jorudan.co.jp)
  const r6 = await get(transitUrl, BROWSER_HEADERS, 'manual');
  if (!r6.ok) throw new Error(`HTTP error! status: ${r6.status}`);
  const body = await r6.text();
  if (!body.includes('<hr size="1"')) {
    throw new Error('Failed to get transit data after cookie flow');
  }
  return body;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

/**
 * Create a JSON Lambda response object
 * @param {number} statusCode - HTTP status code
 * @param {Object} data - Response data
 * @returns {Object} Lambda response
 */
function createJsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  };
}

/**
 * Normalize path by removing /api prefix if present
 * @param {string} path - Request path
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  return path.replace(/^\/api/, '') || '/';
}

/**
 * Split a results page into its route blocks.
 * @param {string} body - Transit results HTML
 * @returns {string[]} Route blocks (empty when Jorudan found no route)
 */
function extractRouteBlocks(body) {
  const blocks = body.split(/<hr size="1" color="black"\s*\/?>/i);
  if (blocks.length < MIN_EXPECTED_BLOCKS) {
    throw new Error(`Unexpected HTML structure: insufficient blocks (got ${blocks.length})`);
  }
  return splitRoutes(blocks[TARGET_BLOCK_INDEX]);
}

/**
 * Build one entry of the structured `origins` field.
 * `error`: the fetch failed, or route blocks exist but none parsed.
 * `no_candidates`: the results page held no route block.
 * @param {{ origin: string, walkMinutes: number }} config - Origin config
 * @param {PromiseSettledResult<string[]>} result - Route blocks for the origin
 * @param {Date} now - Request instant
 * @returns {Object} Origin result
 */
function buildOriginResult({ origin, walkMinutes }, result, now) {
  const searchStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + walkMinutes * 60_000);
  const base = { origin, walkMinutes, searchedFrom: toJstIso(searchStart.getTime()) };
  if (result.status !== 'fulfilled') return { ...base, status: 'error', candidates: [] };
  if (result.value.length === 0) return { ...base, status: 'no_candidates', candidates: [] };
  const parsed = result.value.map(block => parseCandidate(block, searchStart)).filter(Boolean);
  if (parsed.length === 0) return { ...base, status: 'error', candidates: [] };
  return { ...base, status: 'ok', candidates: rankCandidates(parsed, MAX_CANDIDATES) };
}

/**
 * Lambda handler function
 * @param {Object} event - Lambda event object
 * @param {Object} _context - Lambda context object
 * @returns {Object} Response with transit information
 */
export async function handler(event, _context) {
  const rawPath = event.path || event.rawPath || '/transit';
  const path = normalizePath(rawPath);

  // Health check endpoint
  if (path === '/status') {
    return createJsonResponse(200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  try {
    const now = new Date();
    const results = await Promise.allSettled(
      JORUDAN_ORIGINS.map(({ origin, walkMinutes }) =>
        performBotHandshake(buildSearchUrl(origin, walkMinutes, now)).then(extractRouteBlocks)
      )
    );

    const origins = JORUDAN_ORIGINS.map((config, i) => buildOriginResult(config, results[i], now));

    origins.forEach((o, i) => {
      if (o.status !== 'ok') {
        console.error(JSON.stringify({
          level: 'warn',
          message: 'Partial origin fetch failure',
          origin: o.origin,
          status: o.status,
          errorMessage: results[i].status === 'rejected'
            ? results[i].reason?.message
            : (o.status === 'error' ? 'No route block could be parsed' : 'No transit routes found in response'),
        }));
      }
    });

    if (origins.every(o => o.status === 'error')) {
      throw new Error('All origin fetches failed');
    }

    return createJsonResponse(200, {
      generatedAt: toJstIso(Math.floor(now.getTime() / 1000) * 1000),
      destination: JORUDAN_DESTINATION,
      fastestOrigin: pickFastestOrigin(origins),
      origins,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Error fetching transit info',
      errorType: error.name,
      errorMessage: error.message,
    }));
    return createJsonResponse(500, { error: 'Failed to fetch transit information' });
  }
}
