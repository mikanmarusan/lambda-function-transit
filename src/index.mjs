/**
 * AWS Lambda function to fetch transit information from Jorudan
 * Migrated from Python to Node.js 22
 */

const JORUDAN_BASE_URL = 'https://www.jorudan.co.jp';
const JORUDAN_URL_PREFIX = `${JORUDAN_BASE_URL}/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=`;
const JORUDAN_URL_SUFFIX = '&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t';
const JORUDAN_DESTINATION = 'つつじヶ丘（東京）';
const JORUDAN_ORIGINS = [
  { origin: '六本木一丁目', url: `${JORUDAN_URL_PREFIX}%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE${JORUDAN_URL_SUFFIX}` },
  { origin: '神谷町',       url: `${JORUDAN_URL_PREFIX}%E7%A5%9E%E8%B0%B7%E7%94%BA${JORUDAN_URL_SUFFIX}` },
  { origin: '麻布十番',     url: `${JORUDAN_URL_PREFIX}%E9%BA%BB%E5%B8%83%E5%8D%81%E7%95%AA${JORUDAN_URL_SUFFIX}` },
];
const PER_HOP_TIMEOUT_MS = 2500;   // per-fetch timeout for a single hop
const OVERALL_BUDGET_MS = 7000;    // total budget for one origin's full handshake
const ALLOWED_HOSTS = new Set(['www.jorudan.co.jp', 'jid.jorudan.co.jp']);
const MIN_EXPECTED_BLOCKS = 3;
const TARGET_BLOCK_INDEX = 2;  // Third block contains route information
const MAX_CANDIDATES = 2;  // Maximum number of transit candidates to return

/**
 * Escape special regex characters in a string
 * @param {string} string - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract a field value from summary text
 * @param {string} summary - Summary text block
 * @param {string} label - Label to search for (e.g., '発着時間')
 * @returns {string} Extracted value or empty string
 */
function extractField(summary, label) {
  const escapedLabel = escapeRegExp(label);
  const match = summary.match(new RegExp(`${escapedLabel}：([^\r\n]*)`));
  return match ? match[1] : '';
}

/**
 * Extract summary information from HTML block
 * @param {string} block - HTML block containing transit info
 * @returns {string} Summary string with departure/arrival time, duration, and transfers
 */
export function getSummary(block) {
  const summary = block.trim().split(/\r?\n\r?\n/)[0] || '';

  const time = extractField(summary, '発着時間');
  const duration = extractField(summary, '所要時間');
  const transfers = extractField(summary, '乗換回数');

  return `${time}(${duration})(${transfers})`;
}

/**
 * Extract and clean route information from HTML block
 * @param {string} block - HTML block containing transit info
 * @returns {string} Cleaned route information
 */
export function getRoute(block) {
  const route = block.trim().split(/\r?\n\r?\n/)[1] || '';

  return route
    .replace(/｜ 　/g, '｜')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => {
      if (line.startsWith('■') || line.startsWith('◇')) return true;
      if (!line.startsWith('｜')) return false;
      const content = line.slice(1).trim();
      // Keep only line names (filter out times, fares, and arrows)
      return content !== '' && !/^[\d↓↑]/.test(content);
    })
    .join('\n');
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
    'Referer': refererUrl,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
}

/**
 * fetch() bounded by both a per-hop timeout and the remaining origin budget.
 * @param {string} url - URL to fetch
 * @param {Object} opts - { headers, redirect }
 * @param {number} deadline - Date.now() epoch ms after which the origin budget is spent
 * @returns {Promise<Response>}
 */
function fetchWithBudget(url, { headers, redirect = 'manual' }, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Origin budget exhausted');
  return fetch(url, {
    headers,
    redirect,
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

  const get = async (urlObj, headers, redirect) => {
    const cookie = jar.headerFor(urlObj.hostname);
    const res = await fetchWithBudget(
      urlObj.href,
      { headers: cookie ? { ...headers, Cookie: cookie } : headers, redirect },
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

  // The AJAX endpoints share the jid page's querystring (?returl=...)
  const setUrl = isAllowedUrl(`./set_uuid.cgi${jidUrl.search}`, jidUrl.href);
  const verifyUrl = isAllowedUrl(`./verify_uuid.cgi${jidUrl.search}`, jidUrl.href);
  if (!setUrl || !verifyUrl) throw new Error('Bot check: derived UUID URL not allowed');
  const ajaxHeaders = buildAjaxHeaders(jidUrl.href);

  // Hop 3: set_uuid.cgi -> Set-Cookie jrd_cuid (jid-scoped)
  const r3 = await get(setUrl, ajaxHeaders, 'manual');
  if (!r3.ok) throw new Error(`set_uuid failed: ${r3.status}`);

  // Hop 4: verify_uuid.cgi -> plaintext final redirect URL (and Set-Cookie jrd_uuid)
  const r4 = await get(verifyUrl, ajaxHeaders, 'manual');
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
    const results = await Promise.allSettled(
      JORUDAN_ORIGINS.map(({ origin, url }) =>
        performBotHandshake(url).then(body => {
          const blocks = body.split(/<hr size="1" color="black"\s*\/?>/i);
          if (blocks.length < MIN_EXPECTED_BLOCKS) {
            throw new Error(`Unexpected HTML structure: insufficient blocks (got ${blocks.length})`);
          }
          const targetBlock = blocks[TARGET_BLOCK_INDEX];
          const routeBlocks = splitRoutes(targetBlock);
          if (routeBlocks.length === 0) {
            throw new Error('No transit routes found in response');
          }
          const transfers = routeBlocks
            .slice(0, MAX_CANDIDATES)
            .map(route => [getSummary(route), getRoute(route)])
            .filter(([summary, route]) => summary !== '()()' && route.trim());
          if (transfers.length === 0) {
            throw new Error('No valid transit routes found in response');
          }
          return { origin, destination: JORUDAN_DESTINATION, transfers };
        })
      )
    );

    const routes = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(JSON.stringify({
          level: 'warn',
          message: 'Partial origin fetch failure',
          origin: JORUDAN_ORIGINS[i].origin,
          errorMessage: r.reason?.message,
        }));
      }
    });

    if (routes.length === 0) {
      throw new Error('All origin fetches failed');
    }

    return createJsonResponse(200, { routes });
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
