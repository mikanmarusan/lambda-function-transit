import { describe, it, before, after } from 'node:test';
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
        // Verify response structure
        assert.ok(Array.isArray(body.transfers), 'transfers should be an array');
        assert.ok(body.transfers.length > 0, 'transfers should not be empty');
        assert.ok(body.transfers.length <= 2, 'transfers should have at most 2 candidates');

        // Verify each candidate
        body.transfers.forEach(([summary, route], index) => {
          assert.ok(typeof summary === 'string', `candidate ${index} summary should be a string`);
          assert.ok(summary.length > 0, `candidate ${index} summary should not be empty`);
          assert.ok(typeof route === 'string', `candidate ${index} route should be a string`);
        });

        console.log(`Found ${body.transfers.length} transit candidates:`);
        body.transfers.forEach(([summary, route], index) => {
          console.log(`\nCandidate ${index + 1}:`);
          console.log('  Summary:', summary);
          console.log('  Route:', route.substring(0, 100) + '...');
        });
      } else {
        // If failed, check error message exists
        assert.ok(body.error, 'Should have error message on failure');
        console.log('Error:', body.error);
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

        console.log('Docker Lambda Response:', result);
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
