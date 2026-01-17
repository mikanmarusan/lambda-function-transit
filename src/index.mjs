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

const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8' };

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text).replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Generate CSS styles for the HTML page (Light/Dark mode support)
 * @returns {string} CSS styles
 */
function getStyles() {
  return `
    :root {
      --bg-base: #f8fafc;
      --bg-card: #ffffff;
      --bg-muted: #f1f5f9;
      --text-foreground: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --border: rgba(0, 0, 0, 0.08);
      --accent: #0066cc;
      --line-color: #22c55e;
      --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-base: #0f172a;
        --bg-card: #1e293b;
        --bg-muted: #334155;
        --text-foreground: #f8fafc;
        --text-secondary: #cbd5e1;
        --text-muted: #64748b;
        --border: rgba(255, 255, 255, 0.1);
        --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
      background: var(--bg-base);
      color: var(--text-foreground);
      line-height: 1.5;
      padding: 16px;
      min-height: 100vh;
    }
    .container { max-width: 480px; margin: 0 auto; }
    .page-header { text-align: center; margin-bottom: 24px; }
    .page-header h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
    .route-title { font-size: 14px; color: var(--text-secondary); }
    .transit-card {
      background: var(--bg-card);
      border: 0.5px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow-card);
      margin-bottom: 16px;
      overflow: hidden;
    }
    .card-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    .option-badge {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
    }
    .card-body { padding: 16px; }
    .time-display {
      font-family: "SF Mono", ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .time-arrow { color: var(--text-muted); font-weight: 400; }
    .meta {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }
    .route-timeline {
      padding: 16px;
      background: var(--bg-muted);
      border-top: 1px solid var(--border);
    }
    .station {
      position: relative;
      padding-left: 24px;
      padding-top: 6px;
      padding-bottom: 6px;
      font-size: 15px;
    }
    .station::before {
      content: '';
      position: absolute;
      left: 6px;
      top: 50%;
      transform: translateY(-50%);
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--bg-card);
      border: 2px solid var(--line-color);
    }
    .station-terminal::before { background: var(--line-color); }
    .line-name {
      padding-left: 24px;
      font-size: 13px;
      color: var(--text-muted);
      position: relative;
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .line-name::before {
      content: '';
      position: absolute;
      left: 9px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--line-color);
    }
    .page-footer {
      text-align: center;
      padding: 16px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .error-card {
      background: var(--bg-card);
      border: 0.5px solid var(--border);
      border-radius: 8px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: var(--shadow-card);
    }
    .error-card h1 { color: #ef4444; font-size: 18px; margin-bottom: 8px; }
    .error-detail { font-size: 12px; color: var(--text-muted); margin-top: 16px; }
  `;
}

/**
 * Parse summary string to extract time components
 * @param {string} summary - Summary string like "19:47発 → 20:36着(49分)(3回)" or "06:30～08:45(2時間15分)(2回)"
 * @returns {Object} Parsed components
 */
function parseSummary(summary) {
  // Try format: "19:47発 → 20:36着" first, then "06:30～08:45"
  let timeMatch = summary.match(/(\d+:\d+)発.*?(\d+:\d+)着/);
  if (!timeMatch) {
    timeMatch = summary.match(/(\d+:\d+)～(\d+:\d+)/);
  }
  const durationMatch = summary.match(/\(([^)]*分)\)/);
  const transfersMatch = summary.match(/\((\d+回)\)/);

  return {
    departure: timeMatch?.[1] || '',
    arrival: timeMatch?.[2] || '',
    duration: durationMatch?.[1] || '',
    transfers: transfersMatch?.[1] || '',
  };
}

/**
 * Render route text as timeline HTML
 * @param {string} routeText - Route text with stations and lines
 * @returns {string} HTML string
 */
function renderRoute(routeText) {
  const lines = routeText.split('\n').filter((line) => line.trim());
  const totalLines = lines.length;

  return lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('｜')) {
        const lineName = trimmed.slice(1).trim();
        return `<div class="line-name">${escapeHtml(lineName)}</div>`;
      }
      const isTerminal = index === 0 || index === totalLines - 1;
      const stationClass = isTerminal ? 'station station-terminal' : 'station';
      return `<div class="${stationClass}">${escapeHtml(trimmed)}</div>`;
    })
    .join('');
}

/**
 * Render a single transit card
 * @param {Array} transfer - [summary, route] tuple
 * @param {number} index - Card index
 * @returns {string} HTML string
 */
function renderTransitCard(transfer, index) {
  const [summary, route] = transfer;
  const parsed = parseSummary(summary);

  return `
    <article class="transit-card">
      <header class="card-header">
        <span class="option-badge">候補 ${index + 1}</span>
      </header>
      <div class="card-body">
        <div class="time-display">
          <span>${escapeHtml(parsed.departure)}</span>
          <span class="time-arrow">→</span>
          <span>${escapeHtml(parsed.arrival)}</span>
        </div>
        <div class="meta">
          <span>${escapeHtml(parsed.duration)}</span>
          <span>乗換${escapeHtml(parsed.transfers)}</span>
        </div>
      </div>
      <div class="route-timeline">
        ${renderRoute(route)}
      </div>
    </article>
  `;
}

/**
 * Render the full HTML page
 * @param {Array} transfers - Array of [summary, route] tuples
 * @returns {string} Full HTML page
 */
function renderHtmlPage(transfers) {
  const cardsHtml = transfers.map((t, i) => renderTransitCard(t, i)).join('');
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>電車経路</title>
  <style>${getStyles()}</style>
</head>
<body>
  <main class="container">
    <header class="page-header">
      <h1>電車経路</h1>
      <p class="route-title">六本木一丁目 → つつじヶ丘</p>
    </header>
    <section class="cards">
      ${cardsHtml}
    </section>
    <footer class="page-footer">
      <p>更新: ${escapeHtml(timestamp)}</p>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * Render error page HTML
 * @param {string} message - Error message
 * @returns {string} Full HTML error page
 */
function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>エラー | 電車経路</title>
  <style>${getStyles()}</style>
</head>
<body>
  <main class="container">
    <div class="error-card">
      <h1>エラー</h1>
      <p>経路情報の取得に失敗しました</p>
      <p class="error-detail">${escapeHtml(message)}</p>
    </div>
  </main>
</body>
</html>`;
}

/**
 * Create an HTML Lambda response object
 * @param {number} statusCode - HTTP status code
 * @param {string} html - HTML content
 * @returns {Object} Lambda response
 */
function createHtmlResponse(statusCode, html) {
  return {
    statusCode,
    body: html,
    headers: HTML_HEADERS,
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

    return createHtmlResponse(200, renderHtmlPage(transfers));
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Error fetching transit info',
      errorType: error.name,
      errorMessage: error.message,
    }));
    return createHtmlResponse(500, renderErrorPage('サービスが一時的に利用できません'));
  }
}
