import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, auditViews, ToolCallError } from '../index.js';

const config = {
  issuer: 'https://auth.example.com',
  resource: 'https://mcp.example.com/api/mcp',
  toolCallTimeoutMs: 1234,
};

const PROJECT = 'prj_abcdefghijklmnopqrstuvwx';
const OTHER = 'prj_zzzzzzzzzzzzzzzzzzzzzzzz';
const AUDIT = 'agr_abcdefghijklmnopqrstuvwx';

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/** The host window: 28 UTC days ending yesterday. */
function rangeEndingYesterday(days) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: isoDay(start), end: isoDay(end) };
}

function previousRange(range) {
  const end = new Date(`${range.start}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: isoDay(start), end: isoDay(end) };
}

const window28 = rangeEndingYesterday(28);
const prior28 = previousRange(window28);

function toolOk(structured) {
  return Response.json({
    jsonrpc: '2.0',
    id: 1,
    result: { structuredContent: structured, isError: false },
  });
}

function toolIsError(detail, status = 403) {
  return Response.json({
    jsonrpc: '2.0',
    id: 1,
    result: {
      isError: true,
      structuredContent: {
        error: {
          message: 'bisibility API request failed.',
          status,
          payload: { detail, status },
        },
      },
    },
  });
}

const projectRow = {
  id: PROJECT,
  name: 'Example',
  domain: 'example.com',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-02T00:00:00.000Z',
  write_mode: 'active',
};

const auditBody = {
  data: {
    id: AUDIT,
    created_at: '2026-10-28T12:00:00.000Z',
    cached: false,
    result: {
      stop_reason: 'page_limit',
      summary: { pages: 12, errors: 2, warnings: 1, indexable: 10 },
      pages: [
        {
          url: 'https://example.com/',
          issues: [{ code: 'missing_title', severity: 'error', message: 'Missing title' }],
        },
        {
          url: 'https://example.com/a',
          issues: [
            { code: 'missing_title', severity: 'error', message: 'Missing title' },
            { code: 'thin', severity: 'warning', message: 'Thin content' },
          ],
        },
        {
          url: 'https://example.com/b',
          issues: [{ code: 'note', severity: 'info', message: 'Missing alt' }],
        },
      ],
    },
  },
};

function successTools(name, args) {
  if (name === 'list_projects') return toolOk({ data: [projectRow], meta: { next_cursor: null } });
  if (name === 'create_project') {
    assert.equal(args.domain, 'example.com');
    assert.equal(args.name, 'Example');
    return toolOk({ ...projectRow, name: 'Example' });
  }
  if (name === 'list_site_audits') {
    return toolOk({
      data: [{ id: AUDIT, kind: 'site_audit', title: 'Site audit: example.com', created_at: '2026-10-28T12:00:00.000Z' }],
    });
  }
  if (name === 'get_site_audit') {
    assert.equal(args.project_id, PROJECT);
    assert.equal(args.report_id, AUDIT);
    return toolOk(auditBody);
  }
  if (name === 'run_site_audit') {
    assert.equal(args.project_id, PROJECT);
    assert.equal(args.max_pages, 15);
    return toolOk(auditBody);
  }
  if (name === 'list_providers') {
    return toolOk({
      data: [
        { id: 'gsc', connection_status: 'connected', connected: true },
        { id: 'ga4', connection_status: 'connected', connected: true },
      ],
    });
  }
  if (name === 'list_keywords') {
    assert.equal(args.project_id, PROJECT);
    assert.equal(args.limit, 1);
    return toolOk({ data: [{ id: 'kw_abcdefghijklmnopqrstuvwx' }], meta: { next_cursor: null } });
  }
  if (name === 'get_search_performance_totals') {
    assert.deepEqual(args, { project_id: PROJECT, start_date: window28.start, end_date: window28.end });
    return toolOk({
      property: 'sc-domain:example.com', search_type: 'web', source: 'live', previous: null,
      current: {
        start_date: window28.start, end_date: window28.end,
        data_start_date: '2026-10-10', data_end_date: '2026-10-27',
        clicks: 321, impressions: 8765, ctr: 0.0366, position: 7.25,
        freshness: { data_state: 'all', fetched_at: '2026-10-29T12:00:00Z', finalized_through: null, first_incomplete_date: '2026-10-27' },
      },
    });
  }
  if (name === 'list_search_performance_query_stats') {
    assert.equal(args.project_id, PROJECT);
    const current = args.start_date === window28.start && args.end_date === window28.end;
    const previous = args.start_date === prior28.start && args.end_date === prior28.end;
    assert.ok(current || previous, `unexpected query window ${args.start_date} ${args.end_date}`);
    if (current) {
      return toolOk({
        rows: [
          { query: 'rank tracker', clicks: 3, impressions: 40, position: 8 },
          { query: 'seo api', clicks: 10, impressions: 100, position: 4.2 },
        ],
        result: { truncated: false, rows_returned: 2 },
      });
    }
    return toolOk({
      rows: [{ query: 'seo api', clicks: 4, impressions: 20, position: 6 }],
      result: { truncated: false, rows_returned: 1 },
    });
  }
  if (name === 'get_page_indexing_report') {
    return toolOk({
      groups: [
        { group: 'indexed', total: 40 },
        { group: 'not_indexed', total: 12 },
      ],
    });
  }
  if (name === 'list_page_indexing_urls') {
    assert.equal(args.group, 'not_indexed');
    assert.equal(args.project_id, PROJECT);
    return toolOk({
      data: [{ url: 'https://example.com/a' }, { url: 'https://example.com/missing' }],
      meta: { next_cursor: null },
    });
  }
  if (name === 'list_traffic_snapshots') {
    assert.equal(args.project_id, PROJECT);
    assert.equal(args.start_date, window28.start);
    assert.equal(args.end_date, window28.end);
    return toolOk({
      offset: 0,
      total_count: 3,
      rows: [
        { date: '2026-10-01', sessions: 1000, path: '/', provider: 'ga4', window_days: 28 },
        { date: '2026-10-01', sessions: 200, path: '/blog', provider: 'ga4', window_days: 28 },
        { date: '2026-10-02', sessions: 1100, path: '/', provider: 'ga4', window_days: 28 },
        { date: '2026-10-02', sessions: 50, path: '/blog', provider: 'ga4', window_days: 28 },
        { date: '2026-10-02', sessions: 9, path: '/', provider: 'gsc', window_days: 28 },
        { date: '2026-10-02', sessions: 4, path: '/old', provider: 'ga4', window_days: 1 },
      ],
    });
  }
  if (name === 'sync_project_traffic') {
    assert.equal(args.project_id, PROJECT);
    return toolOk({
      connections: 1,
      page_snapshots: 4,
      keyword_snapshots: 0,
      project_id: PROJECT,
      runs: [],
      skipped: [],
    });
  }
  if (name === 'list_agent_reports') {
    assert.equal(args.project_id, PROJECT);
    assert.equal(args.limit, 5);
    return toolOk({
      data: [
        {
          id: 'agr_bbbbbbbbbbbbbbbbbbbbbbbb',
          kind: 'external_analysis',
          title: 'Weekly note',
          created_at: '2026-10-20T00:00:00.000Z',
        },
      ],
      meta: { next_cursor: null },
    });
  }
  if (name === 'get_capabilities') throw new Error('get_capabilities must not be called');
  throw new Error(`unexpected tool ${name}`);
}

function emptyTools(name) {
  if (name === 'list_projects') return toolOk({ data: [], meta: { next_cursor: null } });
  if (name === 'create_project') return toolOk({});
  if (name === 'list_site_audits') return toolOk({ data: [] });
  if (name === 'get_site_audit' || name === 'run_site_audit') {
    return toolOk({
      data: {
        id: AUDIT,
        created_at: '2026-10-28T12:00:00.000Z',
        cached: false,
        result: { stop_reason: 'finished', summary: { pages: 0, errors: 0, warnings: 0, indexable: 0 }, pages: [] },
      },
    });
  }
  if (name === 'list_providers') {
    return toolOk({
      data: [
        { id: 'gsc', connection_status: 'not_connected' },
        { id: 'ga4', connection_status: 'not_connected' },
      ],
    });
  }
  if (name === 'list_keywords') return toolOk({ data: [], meta: { next_cursor: null } });
  if (name === 'list_agent_reports') return toolOk({ data: [], meta: { next_cursor: null } });
  if (name === 'sync_project_traffic') {
    return toolOk({ connections: 0, page_snapshots: 0, keyword_snapshots: 0, skipped: [], runs: [] });
  }
  if (name === 'list_search_performance_query_stats' || name === 'list_traffic_snapshots' || name === 'get_page_indexing_report') {
    throw new Error(`${name} should not run when the provider is disconnected`);
  }
  throw new Error(`unexpected tool ${name}`);
}

function emptyKnownTools(name, args) {
  if (name === 'list_projects') return toolOk({ data: [projectRow], meta: { next_cursor: null } });
  return emptyTools(name, args);
}

/**
 * Mount the Host half the same way as test/call-tool.test.mjs.
 * @param {object} options
 * @param {'success' | 'empty' | 'empty-known' | 'custom' | 'isError' | 'auth' | 'network' | 'jsonrpc' | 'protocol' | 'expired'} options.mode
 * @param {string | null} [options.refresh]
 * @param {(name: string, args: object) => Response} [options.custom]
 */
async function harness({ mode, refresh = 'refresh', custom, token, credentialStore, loader, plugin, initialize = true }) {
  const routes = new Map();
  const warnings = [];
  const ctx = {
    loader,
    plugin,
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
        return credentialStore ?? {
          resolve: async (ref) => (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' && typeof refresh === 'string' ? { value: refresh } : null),
          set: async () => {},
          unset: async () => {},
        };
      }
      throw new Error(`no ${name}`);
    },
  };
  const calls = [];
  let expiredOnce = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith('/api/auth/oauth2/token')) {
      if (typeof token === 'function') return token(init);
      return Response.json({ access_token: `access-${calls.length + 1}`, expires_in: 3600 });
    }
    if (target.endsWith('/api/auth/oauth2/register')) return Response.json({ client_id: 'client' });
    if (target === config.resource) {
      calls.push(init);
      const body = JSON.parse(init.body);
      const name = body?.params?.name;
      const args = body?.params?.arguments ?? {};
      if (mode === 'expired' && !expiredOnce) {
        expiredOnce = true;
        return new Response(null, { status: 401 });
      }
      if (mode === 'auth') return new Response(null, { status: 401 });
      if (mode === 'network') {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
      }
      if (mode === 'jsonrpc') {
        return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'upstream failed', data: { reason: 'bad' } } });
      }
      if (mode === 'protocol') return new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } });
      if (mode === 'isError') return toolIsError('Project limit reached for this account.', 403);
      if (mode === 'empty') return emptyTools(name, args);
      if (mode === 'empty-known') return emptyKnownTools(name, args);
      if (mode === 'custom') return custom(name, args);
      return successTools(name, args);
    }
    return new Response(null, { status: 404 });
  };
  apply(ctx, config);
  const request = async (method, path, body) => {
    const routePath = path.split('?')[0];
    const handler = routes.get(routePath);
    assert.equal(typeof handler, 'function', `missing route ${routePath}`);
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
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
      end(chunk) {
        if (chunk !== undefined) this.text += chunk;
      },
    };
    await handler(req, res);
    return res;
  };
  const status = async () => JSON.parse((await request('GET', '/bisibility/oauth/status')).text);
  if (initialize && refresh !== null) {
    for (let attempt = 0; !(await status()).connected; attempt += 1) {
      assert.ok(attempt < 100, 'the stored token was not restored');
      await new Promise((resolve) => setImmediate(resolve));
    }
  } else if (initialize) {
    await status();
  }
  return {
    calls,
    request,
    callTool: ctx._callTool,
    names: () => calls.map((init) => JSON.parse(init.body).params.name),
    warnings,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function payload(res) {
  return JSON.parse(res.text);
}

const cases = [
  {
    name: 'projects',
    success: (request) => request('GET', '/bisibility/projects'),
    empty: (request) => request('GET', '/bisibility/projects'),
  },
  {
    name: 'create',
    success: (request) => request('POST', '/bisibility/projects', { domain: 'https://Example.com/', name: 'Example', confirm: true }),
    empty: (request) => request('POST', '/bisibility/projects', { domain: 'example.com', confirm: true }),
  },
  {
    name: 'overview',
    success: (request) => request('GET', `/bisibility/overview?project=${PROJECT}`),
    empty: (request) => request('GET', `/bisibility/overview?project=${PROJECT}`),
    emptyNeedsProject: true,
  },
  {
    name: 'project-data',
    success: (request) => request('GET', `/bisibility/project-data?project=${PROJECT}`),
    empty: (request) => request('GET', `/bisibility/project-data?project=${PROJECT}`),
    emptyNeedsProject: true,
  },
  {
    name: 'audit-run',
    success: (request) => request('POST', '/bisibility/audit', { project: PROJECT }),
    empty: (request) => request('POST', '/bisibility/audit', { project: PROJECT }),
    emptyNeedsProject: true,
  },
  {
    name: 'audit-read',
    success: (request) => request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`),
    empty: (request) => request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`),
    emptyNeedsProject: true,
  },
  {
    name: 'traffic',
    success: (request) => request('POST', '/bisibility/traffic', { project: PROJECT }),
    empty: (request) => request('POST', '/bisibility/traffic', { project: PROJECT }),
    emptyNeedsProject: true,
  },
  {
    name: 'recent',
    success: (request) => request('GET', `/bisibility/recent?project=${PROJECT}`),
    empty: (request) => request('GET', `/bisibility/recent?project=${PROJECT}`),
    emptyNeedsProject: true,
  },
];

for (const item of cases) {
  test(`growth ${item.name} returns a shaped success payload`, async () => {
    const { request, names, calls, restore } = await harness({ mode: 'success' });
    try {
      const res = await item.success(request);
      assert.equal(res.statusCode >= 200 && res.statusCode < 300, true, res.text);
      const body = payload(res);
      assert.equal(body.origin, 'https://auth.example.com');
      assert.equal(names().includes('get_capabilities'), false);
      if (item.name === 'projects') {
        assert.deepEqual(body.projects, [{ id: PROJECT, name: 'Example', domain: 'example.com' }]);
      }
      if (item.name === 'create') {
        assert.equal(body.project.id, PROJECT);
        assert.equal(body.project.domain, 'example.com');
        assert.deepEqual(names(), ['create_project']);
      }
      if (item.name === 'overview') {
        assert.equal(body.checklist.audit, true);
        assert.equal(body.checklist.searchConsole, true);
        assert.equal(body.checklist.analytics, true);
        assert.equal(body.checklist.keywords, true);
        assert.equal(body.next.id, 'weekly');
        assert.equal(body.next.skill, 'rank-tracking-report');
        assert.equal(body.next.then, 'competitor-analysis');
        assert.deepEqual(body.audit, { id: AUDIT, createdAt: '2026-10-28T12:00:00.000Z' });
        assert.deepEqual(body.window, window28);
        assert.equal(body.searchConsole.connected, true);
        assert.equal(body.searchConsole.clicks, null);
        assert.deepEqual(body.searchConsole.queries, []);
        assert.equal(body.searchConsole.indexing, null);
        assert.deepEqual(body.analytics.sessions, []);
        assert.throws(() => auditViews(null), /audit summary must be an object/);
        assert.deepEqual(auditViews({ topIssues: [], pages: [], summary: {}, stopReason: null }), []);
        assert.deepEqual([...new Set(names())].sort(), ['list_keywords', 'list_projects', 'list_providers', 'list_site_audits']);
        assert.equal(names().length, 4);
      }
      if (item.name === 'project-data') {
        assert.equal(body.searchConsole.clicks, 321);
        assert.equal(body.searchConsole.impressions, 8765);
        assert.equal(body.searchConsole.ctr, 0.0366);
        assert.equal(body.searchConsole.position, 7.25);
        assert.deepEqual(body.searchConsole.dataWindow, { start: '2026-10-10', end: '2026-10-27' });
        assert.equal(body.searchConsole.freshness.data_state, 'all');
        assert.equal(body.searchConsole.partial, false);
        assert.equal(body.searchConsole.previous, null);
        assert.equal(body.searchConsole.queries[0].query, 'seo api');
        assert.equal(body.searchConsole.indexing.notIndexed, 12);
        assert.deepEqual(body.searchConsole.indexing.urls, ['https://example.com/a', 'https://example.com/missing']);
        assert.deepEqual(body.analytics.sessions, [{ date: '2026-10-02', sessions: 1150 }]);
        assert.deepEqual(body.window, window28);
        const stats = calls.map((init) => JSON.parse(init.body).params).filter((call) => call.name === 'list_search_performance_query_stats');
        assert.equal(stats.length, 1);
        for (const call of stats) assert.equal(call.arguments.limit, 10);
        assert.equal(names().includes('get_site_audit'), false);
        assert.equal(names().includes('list_site_audits'), false);
        assert.equal(names().includes('list_keywords'), false);
        const used = new Set(names());
        for (const allowed of [
          'list_projects',
          'list_providers',
          'get_search_performance_totals',
          'list_search_performance_query_stats',
          'get_page_indexing_report',
          'list_page_indexing_urls',
          'list_traffic_snapshots',
        ]) {
          assert.equal(used.has(allowed), true, allowed);
        }
      }
      if (item.name === 'audit-run' || item.name === 'audit-read') {
        assert.equal(body.audit.pagesCrawled, 12);
        assert.equal(body.audit.stopReason, 'page_limit');
        assert.equal(body.audit.topIssues[0].count, 2);
      }
      if (item.name === 'audit-run') assert.equal(names().includes('run_site_audit'), true);
      if (item.name === 'traffic') {
        assert.equal(body.rateLimited, false);
        assert.equal(body.needsReauth, false);
        assert.equal(body.pageSnapshots, 4);
        assert.deepEqual(names(), ['list_projects', 'sync_project_traffic']);
      }
      if (item.name === 'recent') {
        assert.equal(body.audits.length, 1);
        assert.equal(body.audits[0].id, AUDIT);
        assert.equal(body.audits[0].prompt.startsWith('/seo-audit '), true);
        assert.equal(body.audits[0].prompt.includes('example.com'), true);
        assert.equal(body.reports.length, 1);
        assert.equal(body.reports[0].prompt.startsWith('/seo-audit '), true);
        assert.equal(body.reports[0].prompt.includes('seo-coach'), false);
        assert.equal(body.reports[0].prompt.includes('bisibility:'), false);
        const reportCall = calls.find((init) => JSON.parse(init.body).params.name === 'list_agent_reports');
        assert.equal(JSON.parse(reportCall.body).params.arguments.limit, 5);
        const auditCall = calls.find((init) => JSON.parse(init.body).params.name === 'list_site_audits');
        assert.equal(JSON.parse(auditCall.body).params.arguments.limit, undefined);
      }
    } finally {
      restore();
    }
  });

  test(`growth ${item.name} returns an empty state`, async () => {
    const { request, names, restore } = await harness({ mode: item.emptyNeedsProject ? 'empty-known' : 'empty' });
    try {
      const res = await item.empty(request);
      assert.equal(res.statusCode >= 200 && res.statusCode < 300, true, res.text);
      const body = payload(res);
      if (item.name === 'projects') assert.deepEqual(body.projects, []);
      if (item.name === 'create') assert.equal(body.project, null);
      if (item.name === 'overview') {
        assert.deepEqual(body.checklist, { audit: false, searchConsole: false, analytics: false, keywords: false });
        assert.equal(body.audit, null);
        assert.equal(body.next.id, 'audit');
        assert.equal(body.next.skill, undefined);
        assert.equal(body.searchConsole.connected, false);
        assert.equal(body.analytics.connected, false);
        assert.equal(names().includes('list_search_performance_query_stats'), false);
        assert.equal(names().includes('list_traffic_snapshots'), false);
        assert.equal(names().includes('run_site_audit'), false);
      }
      if (item.name === 'project-data') {
        assert.equal(body.searchConsole.connected, false);
        assert.equal(body.searchConsole.clicks, null);
        assert.equal(body.analytics.connected, false);
        assert.deepEqual(names(), ['list_projects', 'list_providers']);
      }
      if (item.name === 'recent') {
        assert.deepEqual(body.audits, []);
        assert.deepEqual(body.reports, []);
      }
      if (item.name === 'audit-run' || item.name === 'audit-read') {
        assert.equal(body.audit.pagesCrawled, 0);
        assert.deepEqual(body.audit.topIssues, []);
      }
      if (item.name === 'traffic') {
        assert.equal(body.pageSnapshots, 0);
        assert.deepEqual(body.skipped, []);
      }
    } finally {
      restore();
    }
  });

  for (const mode of ['isError', 'auth', 'network', 'jsonrpc', 'protocol', 'expired']) {
    test(`growth ${item.name} maps ${mode}`, async () => {
      const { request, restore } = await harness({ mode: mode === 'expired' ? 'expired' : mode });
      try {
        const res = await item.success(request);
        const body = payload(res);
        if (mode === 'expired') {
          assert.equal(res.statusCode >= 200 && res.statusCode < 300, true, res.text);
          return;
        }
        if (mode === 'isError') {
          assert.equal(res.statusCode, 403);
          assert.equal(body.error.kind, 'tool');
          assert.equal(body.error.message, 'Project limit reached for this account.');
          assert.equal(body.error.status, 403);
          return;
        }
        if (mode === 'auth') {
          assert.equal(res.statusCode, 401);
          assert.equal(body.error.kind, 'auth');
          assert.equal(body.error.signIn, true);
          assert.ok(body.error.message.length > 0);
          return;
        }
        assert.equal(res.statusCode, 502, res.text);
        assert.equal(body.error.kind, mode === 'network' ? 'network' : mode);
        assert.equal(body.error.signIn, undefined);
        if (mode === 'jsonrpc') assert.equal(body.error.code, -32603);
      } finally {
        restore();
      }
    });
  }
}

test('growth overview empty state still knows the project', async () => {
  const { request, restore } = await harness({ mode: 'empty-known' });
  try {
    const res = await request('GET', `/bisibility/overview?project=${PROJECT}`);
    assert.equal(res.statusCode, 200, res.text);
    const body = payload(res);
    assert.equal(body.project.id, PROJECT);
    assert.equal(body.audit, null);
  } finally {
    restore();
  }
});

test('growth traffic surfaces rate_limited and needs_reauth skips', async () => {
  const original = successTools;
  const { request, restore } = await harness({
    mode: 'custom',
    custom(name) {
      if (name === 'list_projects') return toolOk({ data: [projectRow], meta: { next_cursor: null } });
      if (name === 'sync_project_traffic') {
        return toolOk({
          connections: 2,
          page_snapshots: 0,
          keyword_snapshots: 0,
          skipped: [
            { provider: 'ga4', reason: 'rate_limited' },
            { provider: 'gsc', reason: 'needs_reauth' },
          ],
          runs: [],
        });
      }
      return original(name, {});
    },
  });
  try {
    const res = await request('POST', '/bisibility/traffic', { project: PROJECT });
    assert.equal(res.statusCode, 200, res.text);
    const body = payload(res);
    assert.equal(body.rateLimited, true);
    assert.equal(body.needsReauth, true);
    assert.equal(body.skipped.length, 2);
  } finally {
    restore();
  }
});

test('growth create without confirm does not call the tool', async () => {
  const { request, calls, restore } = await harness({ mode: 'success' });
  try {
    for (const body of [{ domain: 'example.com' }, { domain: 'example.com', confirm: false }, { domain: 'example.com', confirm: 'true' }]) {
      calls.length = 0;
      const res = await request('POST', '/bisibility/projects', body);
      assert.equal(res.statusCode, 400, res.text);
      assert.equal(payload(res).error.kind, 'confirm');
      assert.equal(calls.length, 0);
    }
  } finally {
    restore();
  }
});

test('growth audit rejects maxPages above 15', async () => {
  const { request, names, restore } = await harness({ mode: 'success' });
  try {
    const res = await request('POST', '/bisibility/audit', { project: PROJECT, maxPages: 16 });
    assert.equal(res.statusCode, 400, res.text);
    assert.equal(payload(res).error.kind, 'max_pages');
    assert.equal(names().includes('run_site_audit'), false);
  } finally {
    restore();
  }
});

test('growth audit preserves a generic backend denial without claiming subscription is required', async () => {
  const app = await harness({ mode: 'custom', custom: (name, args) => name === 'run_site_audit'
    ? toolIsError('This operation is unavailable for this project.', 403)
    : successTools(name, args) })
  try {
    const res = await app.request('POST', '/bisibility/audit', { project: PROJECT })
    assert.equal(res.statusCode, 403)
    assert.deepEqual(payload(res), { error: { kind: 'tool', message: 'This operation is unavailable for this project.', status: 403 } })
  } finally {
    app.restore()
  }
})

for (const [label, signal] of [
  ['error code', { code: 'subscription_required' }],
  ['problem type', { payload: { type: 'https://bisibility.com/problems/subscription-required' } }],
  ['payload code', { payload: { code: 'subscription_required' } }],
  ['payload flag', { payload: { subscriptionRequired: true } }],
]) {
  test(`audit access: MCP ${label} normalizes the dedicated subscription signal`, async () => {
    const error = { message: 'bisibility API request failed.', status: 403, ...signal, payload: {
      type: 'https://bisibility.com/problems/forbidden', title: 'Forbidden', detail: 'This operation is unavailable for this project.', ...signal.payload,
    } };
    const app = await harness({ mode: 'custom', custom: (name, args) => name === 'run_site_audit'
      ? Response.json({ jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { error }, content: [{ type: 'text', text: JSON.stringify({ error }) }] } })
      : successTools(name, args) });
    try {
      const response = await app.request('POST', '/bisibility/audit', { project: PROJECT });
      assert.equal(response.statusCode, 403);
      assert.equal(payload(response).error.code, 'subscription_required');
      assert.equal(payload(response).error.message, error.payload.detail);
    } finally { app.restore(); }
  });
}

test('audit access: the current generic MCP forbidden envelope stays non-subscription', async () => {
  const error = { message: 'bisibility API request failed.', status: 403, payload: {
    type: 'https://bisibility.com/problems/forbidden', title: 'Forbidden', detail: 'This operation is unavailable for this project.', subscriptionRequired: 'true',
  } };
  const app = await harness({ mode: 'custom', custom: (name, args) => name === 'run_site_audit'
    ? Response.json({ jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { error }, content: [{ type: 'text', text: JSON.stringify({ error }) }] } })
    : successTools(name, args) });
  try {
    const response = await app.request('POST', '/bisibility/audit', { project: PROJECT });
    assert.equal(response.statusCode, 403);
    assert.notEqual(payload(response).error.code, 'subscription_required');
    assert.equal(payload(response).error.message, error.payload.detail);
  } finally { app.restore(); }
});

test('growth unknown project does not run an audit', async () => {
  const { request, names, restore } = await harness({ mode: 'success' });
  try {
    const res = await request('POST', '/bisibility/audit', { project: OTHER });
    assert.equal(res.statusCode, 404, res.text);
    assert.equal(payload(res).error.kind, 'unknown_project');
    assert.equal(names().includes('run_site_audit'), false);
    assert.equal(names().includes('list_projects'), true);
  } finally {
    restore();
  }
});

test('growth routes leave the OAuth status route in place', async () => {
  const { request, restore } = await harness({ mode: 'success' });
  try {
    const res = await request('GET', '/bisibility/oauth/status');
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).connected, true);
    assert.equal(ToolCallError.length >= 0, true);
  } finally {
    restore();
  }
});

test('growth workflows fills the project domain into every starter prompt', async () => {
  const { request, names, restore } = await harness({ mode: 'success' })
  try {
    const res = await request('GET', `/bisibility/workflows?project=${PROJECT}&locale=en`)
    assert.equal(res.statusCode, 200, res.text)
    const body = payload(res)
    assert.equal(body.origin, 'https://auth.example.com')
    assert.equal(body.domain, 'example.com')
    assert.equal(body.project.id, PROJECT)
    assert.equal(body.workflows.length, 19)
    assert.equal(names().includes('get_capabilities'), false)
    assert.deepEqual(names(), ['list_projects'])
    const skills = body.workflows.map((entry) => entry.skill)
    assert.equal(new Set(skills).size, 19)
    for (const entry of body.workflows) {
      assert.equal(entry.prompt.startsWith(`/${entry.promptSkill} `), true, entry.skill)
      assert.equal(entry.prompt.includes('example.com'), true, entry.skill)
      assert.equal(entry.prompt.includes('{domain}'), false, entry.skill)
      assert.equal(entry.title.length > 0, true)
      assert.equal(entry.line.length > 0, true)
    }
    const bySkill = Object.fromEntries(body.workflows.map((entry) => [entry.skill, entry]))
    assert.equal(bySkill['seo-coach'].pack, 'router')
    assert.equal(bySkill['seo-coach'].promptSkill, 'seo-coach')
    assert.equal(bySkill.bisibility.pack, 'router')
    assert.equal(bySkill.bisibility.promptSkill, 'bisibility')
    assert.equal(bySkill.bisibility.rest.decision, 'mark')
    assert.equal(bySkill['domain-onboarding'].pack, 'project-onboarding')
    assert.equal(bySkill['domain-onboarding'].promptSkill, 'domain-onboarding')
    assert.equal(bySkill['keyword-import'].pack, 'project-onboarding')
    assert.equal(bySkill['keyword-import'].promptSkill, 'keyword-import')
    assert.equal(bySkill['self-host-health'], undefined)
    assert.equal(bySkill['provider-setup'].promptSkill, 'provider-setup')
    assert.equal(bySkill['weekly-report'].promptSkill, 'rank-tracking-report')
    assert.equal(bySkill['provider-setup'].rest.decision, 'mark')
    assert.equal(bySkill['team-api-governance'].rest.decision, 'mark')
    assert.equal(bySkill['backlink-profile-analysis'].badge, 'credits')
    assert.equal(bySkill['backlink-profile-analysis'].estimate, 'estimate_only on analyze_backlinks')
    assert.equal(bySkill['keyword-opportunity-research'].badge, 'search-console')
  } finally {
    restore()
  }
})

test('growth workflows rejects an unknown project', async () => {
  const { request, names, restore } = await harness({ mode: 'success' })
  try {
    const res = await request('GET', `/bisibility/workflows?project=${OTHER}`)
    assert.equal(res.statusCode, 404, res.text)
    assert.equal(payload(res).error.kind, 'unknown_project')
    assert.deepEqual(names(), ['list_projects'])
    assert.equal(names().includes('get_capabilities'), false)
  } finally {
    restore()
  }
})

test('growth workflows keeps prompts free of a domain when the project has none', async () => {
  const { request, names, restore } = await harness({
    mode: 'custom',
    custom(name) {
      if (name === 'list_projects') return toolOk({ data: [{ ...projectRow, domain: '' }], meta: { next_cursor: null } })
      if (name === 'get_capabilities') throw new Error('get_capabilities must not be called')
      throw new Error(`unexpected tool ${name}`)
    },
  })
  try {
    const res = await request('GET', `/bisibility/workflows?project=${PROJECT}&locale=zh`)
    assert.equal(res.statusCode, 200, res.text)
    const body = payload(res)
    assert.equal(body.domain, null)
    assert.equal(body.workflows.length, 19)
    assert.equal(body.workflows.find((entry) => entry.skill === 'project-setup').title, '项目设置')
    assert.equal(body.workflows.find((entry) => entry.skill === 'seo-coach').title, '下一步技能')
    for (const entry of body.workflows) {
      assert.equal(entry.prompt.includes('example.com'), false, entry.skill)
      assert.equal(entry.prompt.includes('{domain}'), false, entry.skill)
      assert.equal(entry.prompt.startsWith('/'), true)
    }
    assert.equal(names().includes('get_capabilities'), false)
  } finally {
    restore()
  }
})

test('growth workflows serves the catalog when no project is selected', async () => {
  const { request, names, restore } = await harness({ mode: 'success' })
  try {
    const res = await request('GET', '/bisibility/workflows')
    assert.equal(res.statusCode, 200, res.text)
    const body = payload(res)
    assert.equal(body.project, null)
    assert.equal(body.domain, null)
    assert.equal(body.workflows.length, 19)
    assert.equal(names().includes('list_projects'), false)
    assert.equal(names().includes('get_capabilities'), false)
  } finally {
    restore()
  }
})

test('growth recent rejects an unknown project', async () => {
  const { request, names, restore } = await harness({ mode: 'success' });
  try {
    const res = await request('GET', `/bisibility/recent?project=${OTHER}`);
    assert.equal(res.statusCode, 404, res.text);
    assert.equal(payload(res).error.kind, 'unknown_project');
    assert.deepEqual(names(), ['list_projects']);
    assert.equal(names().includes('list_site_audits'), false);
    assert.equal(names().includes('list_agent_reports'), false);
  } finally {
    restore();
  }
});

test('growth overview next step is Search Console before keywords', async () => {
  const { request, restore } = await harness({
    mode: 'custom',
    custom(name) {
      if (name === 'list_projects') return toolOk({ data: [projectRow], meta: { next_cursor: null } });
      if (name === 'list_site_audits') return toolOk({ data: [{ id: AUDIT, created_at: '2026-10-28T12:00:00.000Z' }] });
      if (name === 'get_site_audit') return toolOk(auditBody);
      if (name === 'list_providers') return toolOk({ data: [{ id: 'gsc', connection_status: 'not_connected' }] });
      if (name === 'list_keywords') return toolOk({ data: [{ id: 'kw_abcdefghijklmnopqrstuvwx' }], meta: { next_cursor: null } });
      throw new Error(`unexpected tool ${name}`);
    },
  });
  try {
    const body = payload(await request('GET', `/bisibility/overview?project=${PROJECT}`));
    assert.equal(body.next.id, 'search-console');
  } finally {
    restore();
  }
});

test('growth overview next step is the first keywords after Search Console', async () => {
  const { request, restore } = await harness({
    mode: 'custom',
    custom(name) {
      if (name === 'list_projects') return toolOk({ data: [projectRow], meta: { next_cursor: null } });
      if (name === 'list_site_audits') return toolOk({ data: [{ id: AUDIT, created_at: '2026-10-28T12:00:00.000Z' }] });
      if (name === 'get_site_audit') return toolOk(auditBody);
      if (name === 'list_providers') return toolOk({ data: [{ id: 'gsc', connection_status: 'connected', connected: true }] });
      if (name === 'list_keywords') return toolOk({ data: [], meta: { next_cursor: null } });
      if (name === 'list_search_performance_query_stats' || name === 'get_page_indexing_report') return toolOk({ rows: [], groups: [] });
      throw new Error(`unexpected tool ${name}`);
    },
  });
  try {
    const body = payload(await request('GET', `/bisibility/overview?project=${PROJECT}`));
    assert.equal(body.next.id, 'keywords');
    assert.equal(body.next.skill, 'project-setup');
  } finally {
    restore();
  }
});

test('growth first paint shares one project list and one audit list, and Project data waits', async () => {
  const { request, names, calls, restore } = await harness({ mode: 'success' });
  try {
    await Promise.all([
      request('GET', '/bisibility/connections?project=' + PROJECT),
      request('GET', '/bisibility/projects'),
      request('GET', `/bisibility/overview?project=${PROJECT}`),
      request('GET', `/bisibility/recent?project=${PROJECT}`),
      request('GET', `/bisibility/workflows?project=${PROJECT}`),
    ]);
    const count = (tool) => names().filter((name) => name === tool).length;
    assert.equal(count('list_projects'), 1);
    assert.equal(count('list_site_audits'), 1);
    assert.equal(count('list_providers'), 1);
    assert.equal(count('list_keywords'), 1);
    assert.equal(count('list_agent_reports'), 1);
    assert.deepEqual([...new Set(names())].sort(), ['list_agent_reports', 'list_keywords', 'list_projects', 'list_providers', 'list_site_audits']);
    for (const late of ['get_site_audit', 'get_search_performance_totals', 'list_search_performance_query_stats', 'get_page_indexing_report', 'list_page_indexing_urls', 'list_traffic_snapshots']) {
      assert.equal(count(late), 0, late);
    }
    await Promise.all([request('GET', `/bisibility/project-data?project=${PROJECT}`), request('GET', `/bisibility/project-data?project=${PROJECT}`)]);
    assert.equal(count('list_traffic_snapshots'), 1);
    assert.equal(count('get_search_performance_totals'), 1);
    assert.equal(count('list_search_performance_query_stats'), 1);
    const queryCalls = calls.map((init) => JSON.parse(init.body).params).filter((call) => call.name === 'list_search_performance_query_stats');
    assert.deepEqual(queryCalls.map((call) => call.arguments.limit), [10]);
    assert.equal(count('list_providers'), 1);
    await request('GET', `/bisibility/project-data?project=${PROJECT}`);
    assert.equal(count('list_traffic_snapshots'), 1);
    await Promise.all([request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`), request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`)]);
    assert.equal(count('get_site_audit'), 1);
    await request('POST', '/bisibility/traffic', { project: PROJECT });
    await request('GET', `/bisibility/project-data?project=${PROJECT}`);
    assert.equal(count('list_traffic_snapshots'), 2);
  } finally {
    restore();
  }
});

test('a refresh that never reaches the token endpoint keeps the grant', async () => {
  let issued = 0;
  const app = await harness({
    token() {
      issued += 1;
      if (issued === 1) return Response.json({ access_token: 'access-1', expires_in: 0 });
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
    },
  });
  try {
    const res = await app.request('GET', `/bisibility/overview?project=${PROJECT}`);
    const body = payload(res);
    assert.equal(res.statusCode, 502);
    assert.equal(body.error.kind, 'network');
    assert.equal(body.error.signIn, undefined);
    const status = payload(await app.request('GET', '/bisibility/oauth/status'));
    assert.equal(status.refreshable, true);
    assert.equal(status.connected, false);
  } finally {
    app.restore();
  }
});

test('a rejected refresh grant asks the panel to sign in', async () => {
  let issued = 0;
  const app = await harness({
    token() {
      issued += 1;
      if (issued === 1) return Response.json({ access_token: 'access-1', expires_in: 0 });
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    },
  });
  try {
    const res = await app.request('GET', `/bisibility/overview?project=${PROJECT}`);
    const body = payload(res);
    assert.equal(res.statusCode, 401);
    assert.equal(body.error.kind, 'auth');
    assert.equal(body.error.signIn, true);
    const status = payload(await app.request('GET', '/bisibility/oauth/status'));
    assert.equal(status.refreshable, false);
  } finally {
    app.restore();
  }
});

test('an unreadable keyword read stays on the keywords card', async () => {
  const app = await harness({
    mode: 'custom',
    custom(name, args) {
      if (name === 'list_keywords') return new Response('<html>nope</html>', { status: 500, headers: { 'content-type': 'text/html' } });
      return successTools(name, args);
    },
  });
  try {
    const res = await app.request('GET', `/bisibility/overview?project=${PROJECT}`);
    const body = payload(res);
    assert.equal(res.statusCode, 200, res.text);
    assert.equal(body.checklist.keywords, null);
    assert.equal(body.keywordsError.tool, 'list_keywords');
    assert.equal(body.keywordsError.kind, 'protocol');
    assert.equal(body.keywordsError.status, 500);
    assert.equal(body.keywordsError.nonJson, true);
    assert.equal(body.searchConsole.connected, true);
    assert.equal(body.error, undefined);
    const line = app.warnings.join('\n');
    assert.match(line, /tool list_keywords status 500 type text\/html nonjson true/);
    assert.equal(line.includes('access-'), false);
  } finally {
    app.restore();
  }
});

test('a saved-audit read failure stays on the audit route and the overview is unaffected', async () => {
  const app = await harness({
    mode: 'custom',
    custom(name, args) {
      if (name === 'get_site_audit') return toolIsError('saved audit unavailable', 502);
      return successTools(name, args);
    },
  });
  try {
    const overview = payload(await app.request('GET', `/bisibility/overview?project=${PROJECT}`));
    assert.equal(overview.audit.id, AUDIT);
    assert.equal(overview.auditError, undefined);
    assert.equal(overview.checklist.audit, true);
    assert.equal(app.names().includes('get_site_audit'), false);
    const res = await app.request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`);
    assert.equal(res.statusCode >= 400, true, res.text);
    assert.equal(payload(res).error.message, 'saved audit unavailable');
    const data = payload(await app.request('GET', `/bisibility/project-data?project=${PROJECT}`));
    assert.equal(data.searchConsole.clicks, 321);
  } finally {
    app.restore();
  }
});

test('an auth failure while reading the saved audit still signs the panel out', async () => {
  const app = await harness({
    mode: 'custom',
    custom(name, args) {
      if (name === 'get_site_audit') return new Response(null, { status: 401 });
      return successTools(name, args);
    },
  });
  try {
    const res = await app.request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`);
    const body = payload(res);
    assert.equal(res.statusCode, 401);
    assert.equal(body.error.signIn, true);
  } finally {
    app.restore();
  }
});

test('a failed Search Console read stays on Project data, and the overview keeps its connections', async () => {
  const app = await harness({
    mode: 'custom',
    custom(name, args) {
      if (name === 'list_search_performance_query_stats') return toolIsError('search unavailable', 502);
      return successTools(name, args);
    },
  });
  try {
    const overview = payload(await app.request('GET', `/bisibility/overview?project=${PROJECT}`));
    assert.equal(overview.searchConsole.connected, true);
    assert.equal(overview.searchConsole.error, null);
    const data = payload(await app.request('GET', `/bisibility/project-data?project=${PROJECT}`));
    assert.equal(data.searchConsole.error.message, 'search unavailable');
    assert.deepEqual(data.analytics.sessions, [{ date: '2026-10-02', sessions: 1150 }]);
  } finally {
    app.restore();
  }
});


function hold() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

test('F5: provider-only response settles while overview keyword and audit calls are pending', async () => {
  const gate = hold();
  const app = await harness({ mode: 'custom', custom: (name, args) => ['list_keywords', 'list_site_audits'].includes(name) ? gate.promise.then(() => successTools(name, args)) : successTools(name, args) });
  let overviewDone = false;
  const overview = app.request('GET', `/bisibility/overview?project=${PROJECT}`).then((res) => { overviewDone = true; return res; });
  try {
    const res = await Promise.race([app.request('GET', '/bisibility/connections?project=' + PROJECT), new Promise((_, reject) => setTimeout(() => reject(new Error('connections waited for overview')), 500))]);
    assert.equal(res.statusCode, 200);
    assert.equal(payload(res).searchConsole.connected, true);
    assert.equal(overviewDone, false);
    assert.equal(app.names().filter((name) => name === 'list_providers').length, 1);
  } finally { gate.release(); await overview; app.restore(); }
});

test('F4: source routes settle independently and omit the unused previous query window', async () => {
  const gate = hold();
  const app = await harness({ mode: 'custom', custom: (name, args) => name === 'get_page_indexing_report' ? gate.promise.then(() => successTools(name, args)) : successTools(name, args) });
  let indexingDone = false;
  const indexing = app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=indexing`).then((res) => { indexingDone = true; return res; });
  try {
    const analytics = payload(await Promise.race([app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=analytics`), new Promise((_, reject) => setTimeout(() => reject(new Error('analytics waited for indexing')), 500))]));
    assert.equal(analytics.analytics.sessions[0].sessions, 1150);
    assert.equal(indexingDone, false);
    const search = payload(await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`));
    assert.equal(search.searchConsole.clicks, 321);
    assert.equal(app.names().filter((name) => name === 'list_search_performance_query_stats').length, 1);
  } finally { gate.release(); await indexing; app.restore(); }
});

test('T2: raw provider rows normalize all four states through the host and client', async () => {
  const app = await harness({ mode: 'custom', custom: (name, args) => name === 'list_providers' ? toolOk({ data: [
    { id: 'dataforseo', connection_status: 'connected', enabled: true },
    { id: 'gsc', connection_status: 'needs_reauth' },
    { id: 'serpapi', connection_status: 'connected', enabled: false },
    { id: 'ga4', connection_status: 'not_connected' },
  ] }) : successTools(name, args) });
  try {
    const body = payload(await app.request('GET', `/bisibility/overview?project=${PROJECT}`));
    assert.deepEqual(body.providers, [
      { id: 'dataforseo', status: 'connected' }, { id: 'gsc', status: 'needs_reauth' },
      { id: 'serpapi', status: 'disabled' }, { id: 'ga4', status: 'not_connected' },
    ]);
    const { mountPanel, panelFetch, findNode } = await import('./panel-harness.mjs');
    const { shapeWorkflows } = await import('../workflows.js');
    const base = panelFetch({ overview: () => body, handle: (url) => url.includes('/workflows') ? Response.json({ workflows: shapeWorkflows('example.com', 'en') }) : undefined });
    const panel = await mountPanel({ fetch: base.fetchImpl });
    findNode(panel.tree(), (node) => node.props?.className === 'bis-providerTrigger').props.onClick();
    await panel.settle();
    for (const [id, state] of [['dataforseo', 'connected'], ['gsc', 'needs_reauth'], ['serpapi', 'disabled']]) {
      assert.equal(findNode(panel.tree(), (node) => node.props?.['data-provider'] === id).props['data-state'], state);
    }
  } finally { app.restore(); }
});

test('search totals recognize the backend missing-tool isError envelope', async () => {
  const app = await harness({ mode: 'custom', custom: (name, args) => name === 'get_search_performance_totals'
    ? Response.json({ jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { error: { name: 'Error', message: 'Unknown MCP tool: get_search_performance_totals' } } } })
    : successTools(name, args) });
  try {
    const res = await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`);
    const card = payload(res).searchConsole;
    assert.equal(card.error, null);
    assert.equal(card.partial, true);
    assert.equal(card.clicks, 13);
    assert.equal(app.names().includes('list_search_performance_query_stats'), true);
  } finally { app.restore(); }
});

test('disconnect denies warm project and audit caches without calling the provider', async () => {
  const app = await harness({ mode: 'success' });
  const paths = ['/bisibility/projects', `/bisibility/overview?project=${PROJECT}`, `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`];
  try {
    for (const path of paths) assert.equal((await app.request('GET', path)).statusCode, 200);
    assert.equal((await app.request('POST', '/bisibility/oauth/disconnect', {})).statusCode, 200);
    const count = app.calls.length;
    for (const path of paths) {
      const res = await app.request('GET', path);
      assert.equal(res.statusCode, 401, path);
      assert.equal(payload(res).error.signIn, true);
    }
    assert.equal(app.calls.length, count);
  } finally { app.restore(); }
});

test('disconnect fences a pending cached read from the previous authentication', async () => {
  let finish;
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const app = await harness({ mode: 'custom', custom: (name, args) => {
    if (name === 'list_projects') { started(); return gate; }
    return successTools(name, args);
  } });
  try {
    const pending = app.request('GET', '/bisibility/projects');
    await ready;
    await app.request('POST', '/bisibility/oauth/disconnect', {});
    finish(successTools('list_projects', {}));
    const res = await pending;
    assert.equal(res.statusCode, 401);
    assert.equal(payload(res).error.signIn, true);
  } finally { app.restore(); }
});

for (const [code, message] of [[-32601, 'Method not found'], [-32602, 'Tool get_search_performance_totals not found'], [-32602, 'Unknown tool: get_search_performance_totals']]) {
  test(`search totals fall back only on missing tool: ${message}`, async () => {
    const app = await harness({ mode: 'custom', custom(name, args) {
      if (name === 'get_search_performance_totals') return Response.json({ jsonrpc: '2.0', id: 1, error: { code, message } });
      return successTools(name, args);
    } });
    try {
      const res = await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`);
      assert.equal(res.statusCode, 200);
      const card = payload(res).searchConsole;
      assert.equal(card.clicks, 13);
      assert.equal(card.impressions, 140);
      assert.equal(card.partial, true);
      assert.equal(card.error, null);
      const stats = app.calls.map((init) => JSON.parse(init.body).params).filter((call) => call.name === 'list_search_performance_query_stats');
      assert.deepEqual(stats.map((call) => call.arguments.limit), [1000]);
    } finally { app.restore(); }
  });
}

for (const [label, failure] of [
  ['provider missing', () => toolIsError('Provider not found', 404)],
  ['provider unavailable', () => toolIsError('search unavailable', 502)],
  ['different missing tool', () => toolIsError('Unknown MCP tool: another_tool', 502)],
  ['invalid input', () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid date range' } })],
  ['internal error', () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'upstream failed' } })],
  ['network', () => { throw new TypeError('fetch failed'); }],
]) {
  test(`search totals ${label} stays a card error without query-sum fallback`, async () => {
    const app = await harness({ mode: 'custom', custom(name, args) {
      if (name === 'get_search_performance_totals') return failure();
      return successTools(name, args);
    } });
    try {
      const res = await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`);
      assert.equal(res.statusCode, 200);
      const card = payload(res).searchConsole;
      assert.ok(card.error);
      assert.equal(card.clicks, null);
      assert.equal(app.names().includes('list_search_performance_query_stats'), false);
    } finally { app.restore(); }
  });
}

test('empty aggregate periods retain zero metrics and null actual dates', async () => {
  const app = await harness({ mode: 'custom', custom(name, args) {
    if (name !== 'get_search_performance_totals') return successTools(name, args);
    return toolOk({ property: 'sc-domain:example.com', search_type: 'web', source: 'stored', previous: null,
      current: { start_date: window28.start, end_date: window28.end, data_start_date: null, data_end_date: null,
        clicks: 0, impressions: 0, ctr: 0, position: 0,
        freshness: { data_state: 'final', fetched_at: '2026-10-29T12:00:00Z', finalized_through: window28.end, first_incomplete_date: null } } });
  } });
  try {
    const card = payload(await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`)).searchConsole;
    assert.equal(card.clicks, 0);
    assert.equal(card.impressions, 0);
    assert.equal(card.ctr, 0);
    assert.equal(card.position, 0);
    assert.deepEqual(card.dataWindow, { start: null, end: null });
    assert.equal(card.freshness.data_state, 'final');
    assert.equal(card.partial, false);
  } finally { app.restore(); }
});

test('invalid totals and tool-argument errors cannot trigger query-sum fallback', async () => {
  for (const response of [toolOk({}), Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Tool argument not found' } })]) {
    const app = await harness({ mode: 'custom', custom(name, args) {
      if (name === 'get_search_performance_totals') return response;
      return successTools(name, args);
    } });
    try {
      const card = payload(await app.request('GET', `/bisibility/project-data?project=${PROJECT}&source=search`)).searchConsole;
      assert.ok(card.error);
      assert.equal(app.names().includes('list_search_performance_query_stats'), false);
    } finally { app.restore(); }
  }
});

for (const late of ['success', 'rejection']) {
  test(`review: late refresh ${late} cannot restore or alter disconnected authentication`, async () => {
    let issued = 0;
    let finish;
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    const gate = new Promise((resolve) => { finish = resolve; });
    const writes = [];
    const app = await harness({
      credentialStore: {
        resolve: async (ref) => ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' ? { value: 'refresh' } : null,
        set: async (ref, value) => { if (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN') writes.push(value); },
        unset: async () => {},
      },
      token() {
        if (++issued === 1) return Response.json({ access_token: 'initial', expires_in: 0 });
        started();
        return gate;
      },
    });
    try {
      const pending = app.request('GET', '/bisibility/projects');
      await ready;
      await app.request('POST', '/bisibility/oauth/disconnect', {});
      finish(late === 'success' ? Response.json({ access_token: 'obsolete', refresh_token: 'obsolete-refresh', expires_in: 3600 }) : Response.json({ error: 'invalid_grant' }, { status: 400 }));
      assert.equal((await pending).statusCode, 401);
      const status = payload(await app.request('GET', '/bisibility/oauth/status'));
      assert.equal(status.connected, false);
      assert.equal(status.refreshable, false);
      assert.equal(status.error, null);
      assert.deepEqual(writes, []);
    } finally { app.restore(); }
  });
}

test('review: a read finishing during a temporary refresh failure stays retryable', async () => {
  let tokenCount = 0;
  let probeCount = 0;
  let releaseRead;
  let releaseRefresh;
  let readStarted;
  let refreshStarted;
  const readReady = new Promise((resolve) => { readStarted = resolve; });
  const refreshReady = new Promise((resolve) => { refreshStarted = resolve; });
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const app = await harness({ mode: 'custom', token() {
    if (++tokenCount === 1) return Response.json({ access_token: 'initial', expires_in: 3600 });
    refreshStarted();
    return refreshGate;
  }, custom(name, args) {
    if (name === 'get_site_audit') { readStarted(); return readGate; }
    if (name === 'refresh_probe') return ++probeCount === 1 ? new Response(null, { status: 401 }) : toolOk({});
    return successTools(name, args);
  } });
  try {
    const read = app.request('GET', `/bisibility/audit?project=${PROJECT}&id=${AUDIT}`);
    await readReady;
    const probe = app.callTool('refresh_probe', {}).catch((error) => error);
    await refreshReady;
    releaseRead(toolOk(auditBody));
    await new Promise((resolve) => setImmediate(resolve));
    releaseRefresh(new Response('temporary outage', { status: 503 }));
    const response = await read;
    await probe;
    assert.equal(response.statusCode, 502);
    assert.equal(payload(response).error.kind, 'network');
    assert.equal(payload(response).error.signIn, undefined);
  } finally { app.restore(); }
});

for (const late of ['success', 'rejection']) {
  test(`review: old refresh ${late} cannot overwrite a new sign-in`, async () => {
    let issued = 0;
    let started;
    let finish;
    const ready = new Promise((resolve) => { started = resolve; });
    const gate = new Promise((resolve) => { finish = resolve; });
    const store = { BISIBILITY_OAUTH_REFRESH_TOKEN: 'initial-refresh' };
    const app = await harness({ mode: 'success', credentialStore: {
      resolve: async (ref) => store[ref] ? { value: store[ref] } : null,
      set: async (ref, value) => { store[ref] = value; },
      unset: async (ref) => { delete store[ref]; },
    }, token(init) {
      if (new URLSearchParams(init.body).get('grant_type') === 'authorization_code') {
        return Response.json({ access_token: 'new-account', refresh_token: 'new-refresh', expires_in: 3600 });
      }
      if (++issued === 1) return Response.json({ access_token: 'old-account', expires_in: 0 });
      started();
      return gate;
    } });
    try {
      const obsolete = app.request('GET', '/bisibility/projects');
      await ready;
      const start = await app.request('GET', '/bisibility/oauth/start');
      const url = new URL(payload(start).authorizeUrl);
      const callback = await app.request('GET', `/bisibility/oauth/callback?state=${url.searchParams.get('state')}&code=fixture-code`);
      assert.equal(callback.statusCode, 200);
      finish(late === 'success' ? Response.json({ access_token: 'obsolete', refresh_token: 'obsolete-refresh', expires_in: 3600 }) : Response.json({ error: 'invalid_grant' }, { status: 400 }));
      assert.equal((await obsolete).statusCode, 401);
      assert.equal((await app.request('GET', '/bisibility/projects')).statusCode, 200);
      assert.equal(app.calls.at(-1).headers.authorization, 'Bearer new-account');
      assert.equal(store.BISIBILITY_OAUTH_REFRESH_TOKEN, 'new-refresh');
    } finally { app.restore(); }
  });
}

test('review: disconnect clears a refresh write that is already persisting', async () => {
  let issued = 0;
  let started;
  let finish;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const store = { BISIBILITY_OAUTH_REFRESH_TOKEN: 'initial-refresh' };
  const app = await harness({ mode: 'success', credentialStore: {
    resolve: async (ref) => store[ref] ? { value: store[ref] } : null,
    async set(ref, value) {
      if (ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN') { started(); await gate; }
      store[ref] = value;
    },
    unset: async (ref) => { delete store[ref]; },
  }, token() {
    return ++issued === 1 ? Response.json({ access_token: 'initial', expires_in: 0 })
      : Response.json({ access_token: 'rotated', refresh_token: 'rotated-refresh', expires_in: 3600 });
  } });
  try {
    const pending = app.request('GET', '/bisibility/projects');
    await ready;
    const disconnect = app.request('POST', '/bisibility/oauth/disconnect', {});
    await new Promise((resolve) => setImmediate(resolve));
    finish();
    await disconnect;
    assert.equal((await pending).statusCode, 401);
    assert.equal(store.BISIBILITY_OAUTH_REFRESH_TOKEN, undefined);
    assert.equal(payload(await app.request('GET', '/bisibility/oauth/status')).connected, false);
  } finally { app.restore(); }
});

test('review: a new sign-in replaces an obsolete in-flight MCP mount', async () => {
  let finishImport;
  const oldImport = new Promise((resolve) => { finishImport = resolve; });
  let imports = 0;
  let mounts = 0;
  const app = await harness({ mode: 'success',
    loader: { import: () => ++imports === 1 ? oldImport : Promise.resolve({ apply() {} }) },
    plugin: () => { mounts++; return { dispose() {} }; },
    token: (init) => Response.json({ access_token: new URLSearchParams(init.body).get('grant_type') === 'authorization_code' ? 'new-account' : 'initial', expires_in: 3600 }),
  });
  try {
    assert.equal(imports, 1);
    const start = await app.request('GET', '/bisibility/oauth/start');
    const url = new URL(payload(start).authorizeUrl);
    assert.equal((await app.request('GET', `/bisibility/oauth/callback?state=${url.searchParams.get('state')}&code=fixture-code`)).statusCode, 200);
    finishImport({ apply() {} });
    await new Promise((resolve) => setImmediate(resolve));
    const status = payload(await app.request('GET', '/bisibility/oauth/status'));
    assert.equal(status.mcp, 'mounted');
    assert.equal(imports, 2);
    assert.equal(mounts, 1);
  } finally { finishImport({ apply() {} }); app.restore(); }
});

test('review: disconnect prevents a retry of a superseded initial credential read', async () => {
  let firstRead;
  let clear;
  const readGate = new Promise((resolve) => { firstRead = resolve; });
  const clearGate = new Promise((resolve) => { clear = resolve; });
  let reads = 0;
  const app = await harness({ mode: 'success', initialize: false, credentialStore: {
    resolve: async (ref) => ref === 'BISIBILITY_OAUTH_REFRESH_TOKEN' ? (++reads === 1 ? readGate : { value: 'old-refresh' }) : null,
    set: async () => {},
    unset: async () => { await clearGate; },
  } });
  try {
    const disconnect = app.request('POST', '/bisibility/oauth/disconnect', {});
    firstRead({ value: 'old-refresh' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(payload(await app.request('GET', '/bisibility/oauth/status')).connected, false);
    assert.equal(reads, 1);
    clear();
    await disconnect;
  } finally { firstRead(null); clear(); app.restore(); }
});

for (const misplaced of [{ type: 'https://bisibility.com/problems/subscription-required' }, { subscriptionRequired: true }]) {
  test(`audit access: misplaced ${Object.keys(misplaced)[0]} is not a subscription signal`, async () => {
    const error = { message: 'bisibility API request failed.', status: 403, ...misplaced, payload: {
      type: 'https://bisibility.com/problems/forbidden', detail: 'This operation is unavailable for this project.',
    } };
    const app = await harness({ mode: 'custom', custom: (name, args) => name === 'run_site_audit'
      ? Response.json({ jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { error } } }) : successTools(name, args) });
    try {
      const response = await app.request('POST', '/bisibility/audit', { project: PROJECT });
      assert.equal(response.statusCode, 403);
      assert.notEqual(payload(response).error.code, 'subscription_required');
    } finally { app.restore(); }
  });
}
