/**
 * AWS Lambda function to fetch transit information from Jorudan
 * Migrated from Python to Node.js 22
 */

const JORUDAN_URL = 'https://www.jorudan.co.jp/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t';
const JORUDAN_BASE_URL = 'https://www.jorudan.co.jp';
const REQUEST_TIMEOUT_MS = 3000;
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
    .replace(/｜ 　/g, '｜')           // Remove extra spacing after separator
    .replace(/\s+$/gm, '')             // Remove trailing spaces from each line
    .replace(/\s{2,}(.*)$/gm, '');     // Remove lines with 2+ leading spaces
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
 * Extract redirect URL from JavaScript redirect page
 * @param {string} body - HTML body containing JS redirect
 * @returns {string|null} Redirect URL or null
 */
function extractRedirectUrl(body) {
  const match = body.match(/window\.location\.href="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Safely join base URL with path, preventing SSRF via protocol injection
 * @param {string} base - Base URL (e.g., 'https://www.jorudan.co.jp')
 * @param {string} path - Path to join
 * @returns {string} Full URL
 * @throws {Error} If path contains protocol or attempts domain escape
 */
function safeJoinUrl(base, path) {
  if (path.startsWith('//') || path.includes('://')) {
    throw new Error('Invalid redirect path detected');
  }
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Extract cookies from Set-Cookie headers
 * @param {Headers} headers - Response headers
 * @returns {string} Cookie string for subsequent requests
 */
function extractCookies(headers) {
  const setCookieHeader = headers.get('set-cookie');
  if (!setCookieHeader) return '';

  return setCookieHeader
    .split(/,(?=\s*\w+=)/)
    .map(part => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

/**
 * Fetch URL with cookie handling for Jorudan's UUID redirect
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML body
 */
async function fetchTransitPage(url) {
  // Step 1: Initial request to get redirect page
  const response1 = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: BROWSER_HEADERS,
    redirect: 'manual',
  });

  const body1 = await response1.text();
  let cookies = extractCookies(response1.headers);

  // Check if we got a JavaScript redirect page
  const redirectPath = extractRedirectUrl(body1);
  if (!redirectPath) {
    // No redirect needed, check if we have valid data
    if (body1.includes('<hr size="1"')) {
      return body1;
    }
    throw new Error('Unexpected response: no redirect and no transit data');
  }

  // Step 2: Follow the UUID redirect to get cookie
  const redirectUrl = safeJoinUrl(JORUDAN_BASE_URL, redirectPath);
  const response2 = await fetch(redirectUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...BROWSER_HEADERS,
      ...(cookies && { Cookie: cookies }),
    },
    redirect: 'manual',
  });

  // Collect cookies from redirect response
  const newCookies = extractCookies(response2.headers);
  if (newCookies) {
    cookies = cookies ? `${cookies}; ${newCookies}` : newCookies;
  }

  // Step 3: Follow Location header if present, or extract final URL
  let finalUrl = response2.headers.get('location');
  if (finalUrl) {
    if (finalUrl.startsWith('http')) {
      const parsedUrl = new URL(finalUrl);
      if (parsedUrl.origin !== JORUDAN_BASE_URL) {
        throw new Error('Invalid redirect: unexpected domain');
      }
    } else {
      finalUrl = safeJoinUrl(JORUDAN_BASE_URL, finalUrl);
    }
  }

  // If no location header, the redirect URL contains the final URL in query param
  if (!finalUrl) {
    const urlParam = new URL(redirectUrl).searchParams.get('url');
    if (urlParam) {
      finalUrl = safeJoinUrl(JORUDAN_BASE_URL, decodeURIComponent(urlParam));
    }
  }

  if (!finalUrl) {
    throw new Error('Could not determine final URL after redirect');
  }

  // Step 4: Fetch the actual transit page with cookies
  const response3 = await fetch(finalUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...BROWSER_HEADERS,
      ...(cookies && { Cookie: cookies }),
    },
  });

  if (!response3.ok) {
    throw new Error(`HTTP error! status: ${response3.status}`);
  }

  const body = await response3.text();

  // Verify we got actual transit data
  if (!body.includes('<hr size="1"')) {
    throw new Error('Failed to get transit data after cookie flow');
  }

  return body;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
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
    const body = await fetchTransitPage(JORUDAN_URL);
    const blocks = body.split(/<hr size="1" color="black"\s*\/?>/i);

    if (blocks.length < MIN_EXPECTED_BLOCKS) {
      throw new Error(`Unexpected HTML structure: insufficient blocks (got ${blocks.length})`);
    }

    const targetBlock = blocks[TARGET_BLOCK_INDEX];
    const routes = splitRoutes(targetBlock);

    if (routes.length === 0) {
      throw new Error('No transit routes found in response');
    }

    const transfers = routes
      .slice(0, MAX_CANDIDATES)
      .map(route => [getSummary(route), getRoute(route)])
      .filter(([summary, route]) => summary !== '()()' && route.trim());

    if (transfers.length === 0) {
      throw new Error('No valid transit routes found in response');
    }

    return createJsonResponse(200, { transfers });
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
