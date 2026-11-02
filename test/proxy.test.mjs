import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../index.js';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const config = { issuer: 'https://auth.example.com', resource: 'https://mcp.example.com/api/mcp' };

/** Mount the Host half against a fake harness and a scripted upstream, once it restored its token. */
async function harness(answer) {
  const routes = new Map();
  const ctx = {
    webServer: { getOrigin: () => 'http://127.0.0.1:9', register: (route) => { routes.set(route.path, route.handler); return () => {}; } },
    effect: (fn) => fn(),
    get: (name) => {
      if (name === 'credentials') return { resolve: async (ref) => (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' ? { value: 'refresh' } : null), set: async () => {}, unset: async () => {} };
      throw new Error(`no ${name}`);
    },
  };
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/api/auth/oauth2/token')) return Response.json({ access_token: 'access', expires_in: 3600 });
    if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'client' });
    if (target === config.resource) {
      calls.push(init.headers);
      return answer.current();
    }
    return new Response(null, { status: 404 });
  };
  apply(ctx, config);
  const call = async (path, method, body) => {
    const chunks = body === undefined ? [] : [Buffer.from(body)];
    const req = { method, url: path, headers: { 'content-type': 'application/json', accept: 'application/json' }, async *[Symbol.asyncIterator]() { yield* chunks; } };
    const res = { statusCode: 0, headers: {}, text: '', setHeader(name, value) { this.headers[name] = value; }, flushHeaders() {}, write(chunk) { this.text += chunk; }, end(chunk) { if (chunk !== undefined) this.text += chunk; } };
    await routes.get(path)(req, res);
    return res;
  };
  const status = async () => JSON.parse((await call('/bisibility/oauth/status', 'GET')).text);
  for (let attempt = 0; !(await status()).connected; attempt += 1) {
    assert.ok(attempt < 100, 'the stored token was not restored');
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { calls, call, status, restore: () => { globalThis.fetch = original; } };
}

const rpc = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
const listed = () => Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } });

test('proxy names the plugin and its version on every forwarded request', async () => {
  const { calls, call, restore } = await harness({ current: listed });
  try {
    assert.equal((await call('/bisibility/mcp', 'POST', rpc)).statusCode, 200);
    assert.equal((await call('/bisibility/mcp', 'POST', rpc)).statusCode, 200);
    assert.equal(calls.length, 2);
    for (const headers of calls) {
      assert.equal(headers['x-bisibility-client'], `bisibility-dsh-plugin/${version}`);
      assert.equal(headers.authorization, 'Bearer access');
    }
  } finally {
    restore();
  }
});

test('a 426 answer reaches the client unchanged and the status reports the floor until it lifts', async () => {
  const refusal = { jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Update the plugin.', data: { minVersion: '9.1.0', updateUrl: 'https://example.com/index.json' } } };
  const answer = { current: () => Response.json(refusal, { status: 426 }) };
  const { call, status, restore } = await harness(answer);
  try {
    assert.equal((await status()).updateRequired, false);
    const res = await call('/bisibility/mcp', 'POST', rpc);
    assert.equal(res.statusCode, 426);
    assert.deepEqual(JSON.parse(res.text), refusal);
    assert.equal((await status()).updateRequired, true);
    assert.equal((await status()).minVersion, '9.1.0');

    answer.current = listed;
    await call('/bisibility/mcp', 'POST', rpc);
    assert.equal((await status()).updateRequired, false);
    assert.equal((await status()).minVersion, null);
  } finally {
    restore();
  }
});

test('a 426 answer without a readable body falls back to the header, then to no version', async () => {
  const answer = { current: () => new Response('upgrade', { status: 426, headers: { 'x-bisibility-min-version': '9.2.0' } }) };
  const { call, status, restore } = await harness(answer);
  try {
    await call('/bisibility/mcp', 'POST', rpc);
    assert.equal((await status()).minVersion, '9.2.0');
    answer.current = () => new Response('upgrade', { status: 426, headers: { 'x-bisibility-min-version': 'not a version' } });
    await call('/bisibility/mcp', 'POST', rpc);
    assert.equal((await status()).updateRequired, true);
    assert.equal((await status()).minVersion, null);
  } finally {
    restore();
  }
});

test('a network failure names the request and its cause, and the next success clears it', async () => {
  const answer = {
    current: () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
    },
  };
  const { call, status, restore } = await harness(answer);
  try {
    assert.equal((await call('/bisibility/mcp', 'POST', rpc)).statusCode, 502);
    assert.equal((await status()).error, 'the bisibility MCP request failed: fetch failed (ECONNRESET)');
    answer.current = listed;
    assert.equal((await call('/bisibility/mcp', 'POST', rpc)).statusCode, 200);
    assert.equal((await status()).error, null);
  } finally {
    restore();
  }
});
