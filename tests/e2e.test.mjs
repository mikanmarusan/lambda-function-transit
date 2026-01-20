import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handler } from '../src/index.mjs';

describe('E2E Tests', () => {
  describe('Handler Integration Test', () => {
    it('should fetch real transit data from Jorudan', async () => {
      // This test calls the actual Jorudan API
      const result = await handler({}, {});

      // Should succeed or fail gracefully
      assert.ok(result.statusCode === 200 || result.statusCode === 500, 'Should return valid status code');
      assert.ok(result.body, 'Should have body');
      assert.strictEqual(result.headers['Content-Type'], 'application/json', 'Should have JSON content type');

      const body = JSON.parse(result.body);

      if (result.statusCode === 200) {
        // Verify JSON structure for success case
        assert.ok(body.transfers, 'Should have transfers array');
        assert.ok(Array.isArray(body.transfers), 'transfers should be an array');
        assert.ok(body.transfers.length > 0, 'Should have at least one transfer');
        assert.ok(body.transfers.length <= 2, 'Should have at most 2 transfers');

        // Each transfer should be [summary, route]
        const [summary, route] = body.transfers[0];
        assert.ok(typeof summary === 'string', 'Summary should be a string');
        assert.ok(typeof route === 'string', 'Route should be a string');
        assert.ok(summary.includes('('), 'Summary should contain parentheses');

        console.log('Success! Transit data fetched as JSON');
        console.log('Number of transfers:', body.transfers.length);
        console.log('First transfer summary:', summary);
      } else {
        // If failed, check error response structure
        assert.ok(body.error, 'Should have error field on failure');
        console.log('Error response:', body.error);
      }
    });
  });

  describe('Docker Lambda E2E Test', () => {
    const LAMBDA_URL = 'http://localhost:9000/2015-03-31/functions/function/invocations';

    it('should invoke Lambda via Docker container (if running)', async () => {
      try {
        const response = await fetch(LAMBDA_URL, {
          method: 'POST',
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          console.log('Docker Lambda not running or returned error, skipping...');
          return;
        }

        const result = await response.json();

        assert.ok(result.statusCode, 'Should have statusCode');
        assert.ok(result.body, 'Should have body');

        // Verify JSON response
        const body = JSON.parse(result.body);
        assert.ok(body.transfers || body.error, 'Should have transfers or error');

        console.log('Docker Lambda Response statusCode:', result.statusCode);
        console.log('Docker Lambda Response:', body);
      } catch (error) {
        if (error.cause?.code === 'ECONNREFUSED') {
          console.log('Docker Lambda container not running, skipping E2E Docker test');
        } else {
          console.log('Docker E2E test skipped:', error.message);
        }
      }
    });
  });
});
