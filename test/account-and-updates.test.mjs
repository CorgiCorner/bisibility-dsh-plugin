import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, compareVersions, latestMarketVersion } from '../index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const config = { issuer: 'https://auth.example.com', resource: 'https://mcp.example.com/api/mcp' };
const INDEX_URL = 'https://corgicorner.github.io/bisibility-dsh-plugin/index.json';

/** Mount the Host half with a credential store and network the test scripts. */
function harness({ store, network }) {
  const routes = new Map();
  const ctx = {
    webServer: { getOrigin: () => 'http://127.0.0.1:9', register: (route) => { routes.set(route.path, route.handler); return () => {}; } },
    effect: (fn) => fn(),
    get: (name) => {
      if (name === 'credentials') {
        return {
          resolve: async (ref) => (ref in store ? { value: store[ref] } : null),
          set: async (ref, value) => { store[ref] = typeof value === 'string' ? value : value?.value; },
          unset: async (ref) => { delete store[ref]; },
        };
      }
      throw new Error(`no ${name}`);
    },
  };
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ target, body: init.body === undefined ? null : String(init.body) });
    return network(target, init);
  };
  apply(ctx, config);
  const request = async (path, method = 'GET') => {
    const res = { statusCode: 0, headers: {}, text: '', setHeader(name, value) { this.headers[name] = value; }, flushHeaders() {}, write(chunk) { this.text += chunk; }, end(chunk) { if (chunk !== undefined) this.text += chunk; } };
    await routes.get(path)({ method, url: path, headers: {}, async *[Symbol.asyncIterator]() {} }, res);
    return res;
  };
  const status = async () => JSON.parse((await request('/bisibility/oauth/status')).text);
  return { calls, request, status, restore: () => { globalThis.fetch = original; } };
}

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const index = (versions) => Response.json({ format: 1, plugins: [{ name: pkg.name, versions: versions.map((version) => ({ version })) }] });

test('versions compare numerically and the newest release wins', () => {
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3-rc.1', '1.2.3'), 0);
  assert.equal(latestMarketVersion({ plugins: [{ name: 'x', versions: [{ version: '0.2.0' }, { version: '0.10.1' }, { version: '1.0.0-rc.1' }] }] }, 'x'), '0.10.1');
  assert.equal(latestMarketVersion({ plugins: [] }, 'x'), null);
  assert.equal(latestMarketVersion(null, 'x'), null);
});

test('the status reports a newer market version and nothing for the running one', async () => {
  for (const [versions, expected] of [[['0.1.0', '99.0.0'], '99.0.0'], [[pkg.version], null]]) {
    const { status, restore } = harness({
      store: {},
      network: (target) => (target === INDEX_URL ? index(versions) : new Response(null, { status: 404 })),
    });
    try {
      await settle();
      assert.equal((await status()).updateAvailable, expected);
    } finally {
      restore();
    }
  }
});

test('a rejected refresh shows the OAuth error code and description', async () => {
  const store = { BISIBILITY_OAUTH_REFRESH_TOKEN: 'stale', BISIBILITY_OAUTH_CLIENT_ID: JSON.stringify({ redirectUri: 'http://127.0.0.1:9/bisibility/oauth/callback', clientId: 'old' }) };
  const { status, restore } = harness({
    store,
    network: (target) => (target.endsWith('/api/auth/oauth2/token')
      ? Response.json({ error: 'invalid_grant', error_description: 'refresh token expired' }, { status: 400 })
      : new Response(null, { status: 404 })),
  });
  try {
    await settle();
    const snapshot = await status();
    assert.equal(snapshot.connected, false);
    assert.match(snapshot.error, /HTTP 400 \(invalid_grant: refresh token expired\)/);
    assert.equal(store.BISIBILITY_OAUTH_REFRESH_TOKEN, undefined);
  } finally {
    restore();
  }
});

test('refresh keeps the client its token belongs to; a new sign-in registers with the new scopes', async () => {
  const redirectUri = 'http://127.0.0.1:9/bisibility/oauth/callback';
  const store = { BISIBILITY_OAUTH_REFRESH_TOKEN: 'refresh', BISIBILITY_OAUTH_CLIENT_ID: JSON.stringify({ redirectUri, clientId: 'old' }) };
  const { calls, request, restore } = harness({
    store,
    network: (target) => {
      if (target.endsWith('/api/auth/oauth2/token')) return Response.json({ access_token: 'access', expires_in: 3600 });
      if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'new' });
      return new Response(null, { status: 404 });
    },
  });
  try {
    await settle();
    const refresh = calls.find((call) => call.target.endsWith('/oauth2/token'));
    assert.ok(refresh !== undefined && new URLSearchParams(refresh.body).get('client_id') === 'old');
    assert.equal(calls.filter((call) => call.target.endsWith('/oauth2/register')).length, 0);
    const started = await request('/bisibility/oauth/start');
    const register = calls.find((call) => call.target.endsWith('/oauth2/register'));
    assert.ok(register !== undefined && JSON.parse(register.body).scope.split(' ').includes('email'));
    const authorize = new URL(JSON.parse(started.text).authorizeUrl);
    assert.equal(authorize.searchParams.get('client_id'), 'new');
    assert.ok(authorize.searchParams.get('scope').split(' ').includes('openid'));
    assert.equal(JSON.parse(store.BISIBILITY_OAUTH_CLIENT_ID).scope, authorize.searchParams.get('scope'));
  } finally {
    restore();
  }
});

test('a restart on another port refreshes with the stored client and registers only for a new sign-in', async () => {
  // The harness listens on a new ephemeral port after each launch; the stored client was registered on the old one.
  const store = {
    BISIBILITY_OAUTH_REFRESH_TOKEN: 'refresh',
    BISIBILITY_OAUTH_CLIENT_ID: JSON.stringify({ redirectUri: 'http://127.0.0.1:53000/bisibility/oauth/callback', clientId: 'old' }),
  };
  const { calls, request, status, restore } = harness({
    store,
    network: (target, init) => {
      if (target.endsWith('/api/auth/oauth2/token')) {
        const clientId = new URLSearchParams(String(init.body)).get('client_id');
        return clientId === 'old'
          ? Response.json({ access_token: 'access', refresh_token: 'rotated', expires_in: 3600 })
          : Response.json({ error: 'invalid_client', error_description: 'invalid client_id' }, { status: 400 });
      }
      if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'new' });
      return new Response(null, { status: 404 });
    },
  });
  try {
    await settle();
    assert.equal((await status()).connected, true);
    assert.equal(store.BISIBILITY_OAUTH_REFRESH_TOKEN, 'rotated');
    assert.equal(calls.filter((call) => call.target.endsWith('/oauth2/register')).length, 0);
    const started = await request('/bisibility/oauth/start');
    assert.equal(new URL(JSON.parse(started.text).authorizeUrl).searchParams.get('client_id'), 'new');
  } finally {
    restore();
  }
});
