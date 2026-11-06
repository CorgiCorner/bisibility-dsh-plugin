import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function bridge(services, clipboard = [], copySucceeds = true) {
  let factory, contribution
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { factory = entry.factory } } },
    navigator: { clipboard: { writeText: async (text) => { clipboard.push(text) } } },
    console, setTimeout, clearTimeout,
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox)
  const plugin = factory((id) => id === 'react' ? { createElement() {} } : { writeClipboard: async (text) => { if (!copySucceeds) return false; await sandbox.navigator.clipboard.writeText(text); return true } })
  plugin.apply({
    effect: (fn) => fn(), locale: { register() {}, bind: () => (key) => key },
    get: (id) => services[id],
    slots: { inject: (_name, fn) => fn(), register: (meta) => { if (meta.name === 'main') contribution = meta.inject() } },
  })
  return contribution.startBisibilityPrompt
}

function fixture({ items, current = 's1', fail = false, applied = 'applied', skipPrepare = false } = {}) {
  const calls = [], copies = []
  const workspaces = { list: { getSnapshot: () => ({ phase: 'ready', items: items ?? [
    { workspaceId: 'w1', sessionIds: ['s1'], createdAt: '2026-10-01' },
    { workspaceId: 'w2', sessionIds: ['s2'], createdAt: '2026-10-02' },
  ] }) } }
  const sessions = { list: { getSnapshot: () => ({ phase: 'ready', byId: { s1: { updatedAt: 2 }, s2: { updatedAt: 5 } } }) }, binding: (id) => ({ sessionId: id }) }
  const uiWorkspace = {
    workspaces, sessions, mainReference: current ? { sessionId: current } : undefined,
    startSession: (...args) => { calls.push(['start', ...args]) },
    async openWorkspace(id, prepare, options) {
      calls.push(['open', id, options])
      if (fail) throw new Error('Host refused creation')
      if (!skipPrepare) prepare('created')
    },
  }
  const conversation = { input: { requestDraftInitialization(binding, options) { calls.push(['draft', binding.sessionId, options]); return applied } } }
  return { start: bridge({ uiWorkspace, workspaces, sessions, conversation }, copies), calls, copies }
}

test('workspace prompt targets active or most recent real workspace and confirms draft adoption', async () => {
  for (const [current, expected] of [['s1', 'w1'], [null, 'w2'], ['ungrouped-session', 'w2']]) {
    const f = fixture({ current })
    assert.equal((await f.start('review example.com')).status, 'ready')
    assert.equal(f.calls[0][0], 'open')
    assert.equal(f.calls[0][1], expected)
    assert.equal(f.calls[1][2].prompt, 'review example.com')
    assert.equal(f.calls[1][2].whenDraftExists, 'replace')
    assert.deepEqual(f.copies, [])
  }
})

test('the native draft API receives slash skills and their task text unchanged', async () => {
  const prompt = '/keyword-opportunity-research Read saved queries for example.com.\n/seo-audit Review saved findings only; do not start a crawl.'
  const f = fixture()
  assert.equal((await f.start(prompt)).status, 'ready')
  assert.equal(f.calls[0][2].agentPreset, 'bisibility')
  const options = f.calls[1][2]
  assert.equal(typeof options.prompt, 'string')
  assert.equal(options.prompt, prompt)
  assert.deepEqual(Object.keys(options).sort(), ['prompt', 'whenDraftExists'])
  assert.deepEqual(f.copies, [])
})

test('no real workspace copies without navigation and opens blank only on the explicit action, even with a directory picker', async () => {
  for (const picker of [false, true]) {
    const calls = [], copies = []
    const uiWorkspace = { startSession: (...args) => calls.push(args), ...(picker ? { pickDirectory() { throw new Error('picker alone cannot adopt a workspace') } } : {}) }
    const start = bridge({ uiWorkspace, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [] }) } } }, copies)
    const result = await start('pending prompt')
    assert.equal(result.status, 'copied')
    assert.deepEqual(copies, ['pending prompt'])
    assert.equal(calls.length, 0, 'copying must not navigate')
    await result.openConversation()
    assert.equal(calls.length, 1)
    assert.equal(calls[0][1]?.prompt, undefined)
    assert.equal(calls[0][1]?.whenDraftExists, undefined)
  }
})

test('workspace prompt propagates refused creation and blocked draft, never false success', async () => {
  await assert.rejects(fixture({ fail: true }).start('hello'), /Host refused creation/)
  await assert.rejects(fixture({ applied: 'blocked' }).start('hello'), (error) => error.code === 'draft.initializationFailed')
  await assert.rejects(fixture({ skipPrepare: true }).start('hello'), /session.failed/)
  const start = bridge({ uiWorkspace: { startSession: async () => ({ ok: false, error: { message: 'Refused' } }) }, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'real', sessionIds: [] }] }) } } })
  await assert.rejects(start('hello'), /Refused/)
})

test('unreadable workspace snapshots copy without probing fire-and-forget navigation', async () => {
  const calls = [], copies = []
  const start = bridge({ uiWorkspace: { startSession: (...args) => { calls.push(args); throw new Error('must not probe') } } }, copies)
  assert.equal((await start('pending prompt')).status, 'copied')
  assert.deepEqual(copies, ['pending prompt'])
  assert.equal(calls.length, 0)
})

test('workspace discovery waits for its baseline and releases the subscription', async () => {
  let snapshot = { phase: 'loading', items: [] }, changed, disposed = false
  const calls = [], copies = []
  const list = { getSnapshot: () => snapshot, subscribe: (listener) => { changed = listener; return () => { disposed = true } } }
  const start = bridge({ uiWorkspace: { startSession: (...args) => calls.push(args) }, workspaces: { list } }, copies)
  const pending = start('wait for workspace discovery')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 0)
  snapshot = { phase: 'ready', items: [] }
  changed()
  assert.equal((await pending).status, 'copied')
  assert.equal(disposed, true)
  assert.deepEqual(copies, ['wait for workspace discovery'])
})

test('clipboard refusal never returns a copied or ready result', async () => {
  const start = bridge({ uiWorkspace: { startSession() {} }, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [] }) } } }, [], false)
  await assert.rejects(start('pending prompt'), /session.copyFailed/)
})

test('copied prompt exposes a workspace watcher that clears guidance when a real workspace appears', async () => {
  let items = [], subscriber, stopped = false, cleared = 0
  const list = { getSnapshot: () => ({ phase: 'ready', items }), subscribe: (fn) => { subscriber = fn; return () => { stopped = true } } }
  const start = bridge({ uiWorkspace: { startSession() {} }, workspaces: { list } })
  const result = await start('pending prompt')
  const stop = result.watchWorkspace(() => { cleared += 1 })
  assert.equal(cleared, 0)
  items = [{ workspaceId: '', sessionIds: ['ungrouped'] }]
  subscriber()
  assert.equal(cleared, 0)
  items = [{ workspaceId: 'real', sessionIds: [] }]
  subscriber()
  assert.equal(cleared, 1)
  stop()
  assert.equal(stopped, true)
})
