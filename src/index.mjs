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
  const items = trimmed.split('\r\n\r\n');
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
  const items = trimmed.split('\r\n\r\n');
  let route = items[1] || '';

  // Remove unnecessary characters and generate detailed route
  route = route.replace(/｜ 　/g, '｜');

  // Remove trailing spaces from each line
  route = route.replace(/\s+$/gm, '');

  // Remove lines with 2+ spaces followed by content
  route = route.replace(/\s{2,}(.*)$/gm, '');

  return route;
}

/**
 * Fetch URL with cookie handling for Jorudan's UUID redirect
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML body
 */
async function fetchTransitPage(url) {
  // Simple headers - timeout set to 8s to leave buffer for Lambda's 10s timeout
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'Python-urllib/3.8',
      'Accept': '*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const body = await response.text();

  // Check if we got a JavaScript redirect page (bot detection)
  if (body.includes('window.location.href=') && !body.includes('<hr size="1"')) {
    throw new Error('Access blocked: Site requires browser-based access. The original Python script may have had stored cookies or was run from an allowed IP.');
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
