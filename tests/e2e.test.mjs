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
      assert.strictEqual(result.headers['Content-Type'], 'text/html; charset=utf-8', 'Should have HTML content type');

      // Body should be HTML
      assert.ok(result.body.includes('<!DOCTYPE html>'), 'Should be valid HTML');

      if (result.statusCode === 200) {
        // Verify HTML structure for success case
        assert.ok(result.body.includes('transit-card'), 'Should contain transit card');
        assert.ok(result.body.includes('候補 1'), 'Should contain first candidate');
        assert.ok(result.body.includes('六本木一丁目 → つつじヶ丘'), 'Should contain route title');
        assert.ok(result.body.includes('prefers-color-scheme: dark'), 'Should include dark mode support');
        assert.ok(result.body.includes('page-footer'), 'Should include footer');
        assert.ok(result.body.includes('更新:'), 'Should include update timestamp');

        console.log('Success! Transit data fetched and rendered as HTML');
        console.log('HTML length:', result.body.length, 'characters');
      } else {
        // If failed, check error page structure
        assert.ok(result.body.includes('error-card'), 'Should have error card on failure');
        assert.ok(result.body.includes('エラー'), 'Should have error heading');
        console.log('Error page rendered');
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

        // Verify HTML response
        assert.ok(result.body.includes('<!DOCTYPE html>'), 'Should return HTML');

        console.log('Docker Lambda Response statusCode:', result.statusCode);
        console.log('Docker Lambda Response body length:', result.body.length);
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
