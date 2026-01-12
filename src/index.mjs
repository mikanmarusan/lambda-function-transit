/**
 * AWS Lambda function to fetch transit information from Jorudan
 * Migrated from Python to Node.js 22
 */

const JORUDAN_URL = 'https://www.jorudan.co.jp/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t';

/**
 * Extract a field value from summary text
 * @param {string} summary - Summary text block
 * @param {string} label - Label to search for (e.g., '発着時間')
 * @returns {string} Extracted value or empty string
 */
function extractField(summary, label) {
  const match = summary.match(new RegExp(`${label}：([^\r\n]*)`));
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
    signal: AbortSignal.timeout(3000),
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
  const redirectUrl = `https://www.jorudan.co.jp${redirectPath}`;
  const response2 = await fetch(redirectUrl, {
    signal: AbortSignal.timeout(3000),
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
  if (finalUrl && !finalUrl.startsWith('http')) {
    finalUrl = `https://www.jorudan.co.jp${finalUrl}`;
  }

  // If no location header, the redirect URL contains the final URL in query param
  if (!finalUrl) {
    const urlParam = new URL(redirectUrl).searchParams.get('url');
    if (urlParam) {
      finalUrl = `https://www.jorudan.co.jp${decodeURIComponent(urlParam)}`;
    }
  }

  if (!finalUrl) {
    throw new Error('Could not determine final URL after redirect');
  }

  // Step 4: Fetch the actual transit page with cookies
  const response3 = await fetch(finalUrl, {
    signal: AbortSignal.timeout(3000),
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

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Create a Lambda response object
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body object
 * @returns {Object} Lambda response
 */
function createResponse(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
  };
}

/**
 * Lambda handler function
 * @param {Object} event - Lambda event object
 * @param {Object} context - Lambda context object
 * @returns {Object} Response with transit information
 */
export async function handler(event, context) {
  try {
    const body = await fetchTransitPage(JORUDAN_URL);
    const blocks = body.split(/<hr size="1" color="black"\s*\/?>/i);

    if (blocks.length < 3) {
      throw new Error(`Unexpected HTML structure: insufficient blocks (got ${blocks.length})`);
    }

    const targetBlock = blocks[2];
    const transfers = [[getSummary(targetBlock), getRoute(targetBlock)]];

    return createResponse(200, { transfers });
  } catch (error) {
    console.error('Error fetching transit info:', error.message, error.stack);
    return createResponse(500, { error: 'Failed to fetch transit information' });
  }
}
