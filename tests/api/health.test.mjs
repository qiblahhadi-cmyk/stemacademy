import { describe, it } from 'node:test';
import assert from 'node:assert';
import { handler } from '../../netlify/functions/api.mjs';

describe('Serverless API Health & Routing Smoke Tests', () => {
  it('handles CORS OPTIONS preflight requests correctly', async () => {
    const event = {
      httpMethod: 'OPTIONS',
      path: '/api/v1/classes',
      headers: {}
    };

    const response = await handler(event, {});
    assert.strictEqual(response.statusCode, 204);
    assert.ok(response.headers['Access-Control-Allow-Origin']);
  });

  it('returns 404 for unknown API routes', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/api/v1/nonexistent',
      headers: {}
    };

    const response = await handler(event, {});
    assert.strictEqual(response.statusCode, 404);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
  });
});
