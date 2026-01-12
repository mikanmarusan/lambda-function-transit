/**
 * AWS Lambda function to fetch transit information from Jorudan
 * Migrated from Python to Node.js 22
 */

const JORUDAN_URL = 'https://www.jorudan.co.jp/norikae/cgi/nori.cgi?rf=top&eok1=R-&eok2=R-&pg=0&eki1=%E5%85%AD%E6%9C%AC%E6%9C%A8%E4%B8%80%E4%B8%81%E7%9B%AE&Cmap1=&eki2=%E3%81%A4%E3%81%A4%E3%81%98%E3%83%B6%E4%B8%98%EF%BC%88%E6%9D%B1%E4%BA%AC%EF%BC%89&Cway=0&Cfp=1&Czu=2&S=%E6%A4%9C%E7%B4%A2&Csg=1&type=t';

/**
 * Extract summary information from HTML block
 * @param {string} block - HTML block containing transit info
 * @returns {string} Summary string with departure/arrival time, duration, and transfers
 */
export function getSummary(block) {
  const trimmed = block.trim();
  // Handle both \r\n\r\n and \n\n as block separators
  const items = trimmed.split(/\r?\n\r?\n/);
  const summary = items[0] || '';

  let arrivalAndDepartureTime = '';
  let requireTime = '';
  let transfer = '';

  const timeMatch = summary.match(/発着時間：([^\r\n]*)/);
  if (timeMatch) {
    arrivalAndDepartureTime = timeMatch[1];
  }

  const durationMatch = summary.match(/所要時間：([^\r\n]*)/);
  if (durationMatch) {
    requireTime = durationMatch[1];
  }

  const transferMatch = summary.match(/乗換回数：([^\r\n]*)/);
  if (transferMatch) {
    transfer = transferMatch[1];
  }

  return `${arrivalAndDepartureTime}(${requireTime})(${transfer})`;
}

/**
 * Extract and clean route information from HTML block
 * @param {string} block - HTML block containing transit info
 * @returns {string} Cleaned route information
 */
export function getRoute(block) {
  const trimmed = block.trim();
  // Handle both \r\n\r\n and \n\n as block separators
  const items = trimmed.split(/\r?\n\r?\n/);
  let route = items[1] || '';

  // Remove unnecessary characters and generate detailed route
  route = route.replace(/｜ 　/g, '｜');

  // Remove trailing spaces from each line
  route = route.replace(/\s+$/gm, '');

  // Remove lines with 2+ spaces followed by content
  route = route.replace(/\s{2,}(.*)$/gm, '');

  return route;
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
  const cookies = [];
  const setCookieHeader = headers.get('set-cookie');
  if (setCookieHeader) {
    // Handle multiple cookies (may be comma-separated or multiple headers)
    const cookieParts = setCookieHeader.split(/,(?=\s*\w+=)/);
    for (const part of cookieParts) {
      const cookieValue = part.split(';')[0].trim();
      if (cookieValue) {
        cookies.push(cookieValue);
      }
    }
  }
  return cookies.join('; ');
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

/**
 * Lambda handler function
 * @param {Object} event - Lambda event object
 * @param {Object} context - Lambda context object
 * @returns {Object} Response with transit information
 */
export const handler = async (event, context) => {
  const urls = [JORUDAN_URL];
  const transfers = [];

  try {
    for (const url of urls) {
      const body = await fetchTransitPage(url);

      // Handle both self-closing and non-self-closing hr tags
      const blocks = body.split(/<hr size="1" color="black"\s*\/?>/i);

      if (blocks.length < 3) {
        throw new Error(`Unexpected HTML structure: insufficient blocks (got ${blocks.length})`);
      }

      const targetBlock = blocks[2];

      const summary = getSummary(targetBlock);
      const route = getRoute(targetBlock);
      transfers.push([summary, route]);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ transfers }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  } catch (error) {
    // Log detailed error for debugging but return generic message to clients
    console.error('Error fetching transit info:', error.message, error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch transit information' }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }
};
