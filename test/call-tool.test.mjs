import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply, ToolCallError } from '../index.js';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const config = {
  issuer: 'https://auth.example.com',
  resource: 'https://mcp.example.com/api/mcp',
  toolCallTimeoutMs: 1234,
};
/** Matches `PROXY_GRACE_MS` added to `settings.toolCallTimeoutMs` inside callTool. */
const toolTimeoutMs = 1234 + 30000;

/**
 * Mount the Host half against a fake harness and a scripted upstream.
 * @param {object} options
 * @param {() => Response} options.resource - answer for the MCP resource.
 * @param {(attempt: number) => Response} [options.token] - answer for the token endpoint.
 * @param {string | null} [options.refresh] - stored refresh token; null means signed out.
 */
async function harness({ resource, token, refresh = 'refresh' }) {
  const routes = new Map();
  const warnings = [];
  const ctx = {
    webServer: {
      getOrigin: () => 'http://127.0.0.1:9',
      register: (route) => {
        routes.set(route.path, route.handler);
        return () => {};
      },
    },
    effect: (fn) => fn(),
    logger: { warn: (message) => warnings.push(String(message)) },
    get: (name) => {
      if (name === 'credentials') {
        return {
          resolve: async (ref) => (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' && typeof refresh === 'string' ? { value: refresh } : null),
          set: async () => {},
          unset: async () => {},
        };
      }
      throw new Error(`no ${name}`);
    },
  };
  const calls = [];
  let tokenCalls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/api/auth/oauth2/token')) {
      tokenCalls += 1;
      return token ? token(tokenCalls) : Response.json({ access_token: 'access', expires_in: 3600 });
    }
    if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'client' });
    if (target === config.resource) {
      calls.push(init);
      return resource(init, calls.length);
    }
    return new Response(null, { status: 404 });
  };
  apply(ctx, config);
  const call = async (path, method, body) => {
    const chunks = body === undefined ? [] : [Buffer.from(body)];
    const req = {
      method,
      url: path,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      async *[Symbol.asyncIterator]() {
        yield* chunks;
      },
    };
    const res = {
      statusCode: 0,
      headers: {},
      text: '',
      setHeader(name, value) {
        this.headers[name] = value;
      },
      flushHeaders() {},
      write(chunk) {
        this.text += chunk;
      },
      end(chunk) {
        if (chunk !== undefined) this.text += chunk;
      },
    };
    await routes.get(path)(req, res);
    return res;
  };
  const status = async () => JSON.parse((await call('/bisibility/oauth/status', 'GET')).text);
  if (refresh !== null) {
    for (let attempt = 0; !(await status()).connected; attempt += 1) {
      assert.ok(attempt < 100, 'the stored token was not restored');
      await new Promise((resolve) => setImmediate(resolve));
    }
  } else {
    await status();
  }
  assert.equal(typeof ctx._callTool, 'function');
  return {
    calls,
    callTool: ctx._callTool,
    warnings,
    tokenCalls: () => tokenCalls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const structured = () =>
  Response.json({
    jsonrpc: '2.0',
    id: 1,
    result: {
      structuredContent: { pages: 1 },
      content: [{ type: 'text', text: 'ignored' }],
      isError: false,
    },
  });

test('callTool returns structured content and reads one SSE data frame', { timeout: 3000 }, async () => {
  const answer = { current: structured };
  const { calls, callTool, restore } = await harness({ resource: () => answer.current() });
  const timeouts = [];
  const original = AbortSignal.timeout;
  AbortSignal.timeout = (ms) => {
    timeouts.push(ms);
    return original.call(AbortSignal, ms);
  };
  try {
    assert.deepEqual(await callTool('run_site_audit', { url: 'https://example.com' }), {
      structuredContent: { pages: 1 },
      isError: false,
    });
    const init = calls[0];
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.authorization, 'Bearer access');
    assert.equal(init.headers.accept, 'application/json, text/event-stream');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(init.headers['x-bisibility-client'], `bisibility-dsh-plugin/${version}`);
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'run_site_audit', arguments: { url: 'https://example.com' } },
    });

    answer.current = () => {
      const encoder = new TextEncoder();
      let release = () => {};
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              [
                ': keep-alive',
                'event: message',
                'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"hello "},{"type":"text","text":"there"}]}}',
                '',
                'data: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"ignored"}]}}',
                '',
              ].join('\n'),
            ),
          );
        },
        pull() {
          return new Promise((resolve) => {
            release = resolve;
          });
        },
        cancel() {
          release();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    assert.deepEqual(await callTool('list_site_audits'), { text: 'hello there', isError: false });
    assert.deepEqual(JSON.parse(calls[1].body).params.arguments, {});
    assert.deepEqual(timeouts, [toolTimeoutMs, toolTimeoutMs]);
  } finally {
    AbortSignal.timeout = original;
    restore();
  }
});

test('callTool returns isError with the tool text', async () => {
  const { callTool, restore } = await harness({
    resource: () =>
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'quota exceeded' }], isError: true },
      }),
  });
  try {
    assert.deepEqual(await callTool('run_site_audit', {}), { text: 'quota exceeded', isError: true });
  } finally {
    restore();
  }
});

test('callTool throws a JSON-RPC error', async () => {
  const { calls, callTool, tokenCalls, restore } = await harness({
    resource: () =>
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Unknown tool', data: { name: 'nope' } },
      }),
  });
  try {
    const before = tokenCalls();
    await assert.rejects(callTool('nope', {}), (error) => {
      assert.ok(error instanceof ToolCallError);
      assert.equal(error.kind, 'jsonrpc');
      assert.equal(error.code, -32602);
      assert.equal(error.message, 'Unknown tool');
      assert.deepEqual(error.data, { name: 'nope' });
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(tokenCalls(), before);
  } finally {
    restore();
  }
});

test('callTool refreshes an expired token once and retries', async () => {
  let resources = 0;
  const { callTool, tokenCalls, restore } = await harness({
    token: (attempt) => Response.json({ access_token: `access-${attempt}`, expires_in: 3600 }),
    resource: (init) => {
      resources += 1;
      if (resources === 1) {
        assert.equal(init.headers.authorization, 'Bearer access-1');
        return new Response(null, { status: 401 });
      }
      assert.equal(init.headers.authorization, 'Bearer access-2');
      return Response.json({
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: 'fresh' }] },
      });
    },
  });
  try {
    const before = tokenCalls();
    assert.deepEqual(await callTool('get_site_audit', { id: '1' }), { text: 'fresh', isError: false });
    assert.equal(resources, 2);
    assert.equal(tokenCalls() - before, 1);
  } finally {
    restore();
  }
});

test('callTool throws when the refresh after a 401 fails', async () => {
  let resources = 0;
  const { callTool, tokenCalls, restore } = await harness({
    token: (attempt) => {
      if (attempt === 1) return Response.json({ access_token: 'access', expires_in: 3600 });
      return Response.json({ error: 'invalid_grant', error_description: 'refresh token expired' }, { status: 400 });
    },
    resource: () => {
      resources += 1;
      return new Response('expired', { status: 401 });
    },
  });
  try {
    const before = tokenCalls();
    await assert.rejects(callTool('run_site_audit', {}), (error) => {
      assert.ok(error instanceof ToolCallError);
      assert.equal(error.kind, 'auth');
      assert.match(error.message, /token refresh failed with HTTP 400/);
      return true;
    });
    assert.equal(resources, 1);
    assert.equal(tokenCalls() - before, 1);
  } finally {
    restore();
  }
});

test('callTool throws when the retried call is still unauthorized', async () => {
  let resources = 0;
  const { callTool, tokenCalls, restore } = await harness({
    token: (attempt) => Response.json({ access_token: `access-${attempt}`, expires_in: 3600 }),
    resource: () => {
      resources += 1;
      return new Response(null, { status: 401 });
    },
  });
  try {
    const before = tokenCalls();
    await assert.rejects(callTool('run_site_audit', {}), (error) => {
      assert.ok(error instanceof ToolCallError);
      assert.equal(error.kind, 'auth');
      assert.equal(error.message, 'bisibility rejected the access token');
      return true;
    });
    assert.equal(resources, 2);
    assert.equal(tokenCalls() - before, 1);
  } finally {
    restore();
  }
});

test('callTool throws a network error', async () => {
  const { callTool, restore } = await harness({
    resource: () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
    },
  });
  try {
    await assert.rejects(callTool('run_site_audit', {}), (error) => {
      assert.ok(error instanceof ToolCallError);
      assert.equal(error.kind, 'network');
      assert.match(error.message, /the bisibility tool call failed: fetch failed \(ECONNRESET\)/);
      return true;
    });
  } finally {
    restore();
  }
});

test('an unreadable HTTP 500 records the tool and hides secrets', async () => {
  const { callTool, warnings, restore } = await harness({
    resource: () => new Response('<html>owner@example.com secret-token</html>', { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  })
  try {
    await assert.rejects(callTool('list_keywords', { project_id: 'prj_abcdefghijklmnopqrstuvwx', limit: 1, note: 'owner@example.com' }), (error) => {
      assert.ok(error instanceof ToolCallError)
      assert.equal(error.kind, 'protocol')
      assert.equal(error.status, 500)
      assert.equal(error.tool, 'list_keywords')
      assert.equal(error.nonJson, true)
      assert.match(error.contentType, /text\/html/)
      return true
    })
    const line = warnings.join('\n')
    assert.match(line, /tool list_keywords status 500/)
    assert.match(line, /nonjson true/)
    assert.match(line, /project_id=prj_abcdefghijklmnopqrstuvwx/)
    assert.match(line, /limit=1/)
    assert.match(line, /note=string\(17\)/)
    assert.equal(line.includes('owner@example.com'), false)
    assert.equal(line.includes('secret-token'), false)
    const planted = line.replace('note=string(17)', 'note=owner@example.com')
    assert.throws(() => {
      if (planted.includes('owner@example.com')) throw new Error('logged secret')
    }, /logged secret/)
  } finally {
    restore()
  }
})

test('callTool does not call upstream without a token', async () => {
  const { calls, callTool, tokenCalls, restore } = await harness({
    refresh: null,
    resource: () => {
      throw new Error('upstream was called without a token');
    },
  });
  try {
    await assert.rejects(callTool('run_site_audit', { url: 'https://example.com' }), (error) => {
      assert.ok(error instanceof ToolCallError);
      assert.equal(error.kind, 'auth');
      assert.equal(error.message, 'bisibility is not connected');
      return true;
    });
    assert.equal(calls.length, 0);
    assert.equal(tokenCalls(), 0);
  } finally {
    restore();
  }
});
