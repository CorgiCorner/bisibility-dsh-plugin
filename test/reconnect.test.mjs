import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../index.js';

const config = { issuer: 'https://auth.example.com', resource: 'https://mcp.example.com/api/mcp' };

/** Mount the Host half with a credential store and token endpoint the test controls. */
function harness({ storeAvailable, tokenAnswer }) {
  const routes = new Map();
  const ctx = {
    webServer: { getOrigin: () => 'http://127.0.0.1:9', register: (route) => { routes.set(route.path, route.handler); return () => {}; } },
    effect: (fn) => fn(),
    get: (name) => {
      if (name === 'credentials' && storeAvailable.current) {
        return { resolve: async (ref) => (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' ? { value: 'refresh' } : null), set: async () => {}, unset: async () => {} };
      }
      throw new Error(`no ${name}`);
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/api/auth/oauth2/token')) return tokenAnswer.current();
    if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'client' });
    return new Response(null, { status: 404 });
  };
  apply(ctx, config);
  const status = async () => {
    const res = { statusCode: 0, headers: {}, text: '', setHeader() {}, flushHeaders() {}, write(chunk) { this.text += chunk; }, end(chunk) { if (chunk !== undefined) this.text += chunk; } };
    await routes.get('/bisibility/oauth/status')({ method: 'GET', url: '/bisibility/oauth/status', headers: {} }, res);
    return JSON.parse(res.text);
  };
  return { status, restore: () => { globalThis.fetch = original; } };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const granted = () => Response.json({ access_token: 'access', expires_in: 3600 });

test('a credential store that appears after start is read on the next status', async () => {
  const storeAvailable = { current: false };
  const { status, restore } = harness({ storeAvailable, tokenAnswer: { current: granted } });
  try {
    await settle();
    assert.equal((await status()).connected, false);
    storeAvailable.current = true;
    assert.equal((await status()).connected, true);
  } finally {
    restore();
  }
});

test('a refresh that failed on the network is retried by the next status', async () => {
  const tokenAnswer = {
    current: () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('offline'), { code: 'ENOTFOUND' }) });
    },
  };
  const { status, restore } = harness({ storeAvailable: { current: true }, tokenAnswer });
  try {
    for (let i = 0; i < 20; i += 1) await settle();
    const failed = await status();
    assert.equal(failed.connected, false);
    assert.match(failed.error, /ENOTFOUND/);
    tokenAnswer.current = granted;
    const recovered = await status();
    assert.equal(recovered.connected, true);
    // The fake harness has no Cordis loader, so only the network error must be gone.
    assert.doesNotMatch(recovered.error ?? "", /ENOTFOUND/);
  } finally {
    restore();
  }
});
