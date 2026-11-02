import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshRejected } from '../index.js';

test('only a rejected grant discards the refresh token', () => {
  assert.equal(refreshRejected(400), true);
  assert.equal(refreshRejected(401), true);
  for (const status of [undefined, 200, 403, 408, 429, 500, 502, 503, 504]) {
    assert.equal(refreshRejected(status), false, `status ${status}`);
  }
});
