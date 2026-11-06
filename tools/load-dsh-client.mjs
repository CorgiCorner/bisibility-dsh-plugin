import { readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { Window } from 'happy-dom'

/**
 * Load client.js through the same factory call DSH uses, with the react and
 * primitives objects from the installed DeepSeek Harness frontend.
 * Those packages are seed modules inside the frontend bundle, not directories
 * under node_modules. Exits 2 when the factory throws and 3 when the panel
 * render throws.
 */

const source = process.argv[2]
const clientPath = process.argv[3]

if (source && clientPath) {
const frontend = statSync(source).isDirectory() ? readAssetsDir(source) : readAsar(source)
const window = new Window({ url: 'dsh-app://app/', width: 1200, height: 800 })
window.console = console
const context = vm.createContext(window)
const modules = await captureModules(context, frontend)
const plugin = runFactory(context, clientPath, modules)
console.log('factory ok')

const panels = []
plugin.apply({
  effect(fn) {
    fn()
  },
  locale: { register() {}, bind: () => (key) => key },
  get() {
    throw new Error('missing')
  },
  slots: {
    inject(_name, fn) {
      fn()
    },
    register(_meta, component) {
      panels.push(component)
      return () => {}
    },
  },
})
const Panel = panels[0]
if (typeof Panel !== 'function') throw new Error('the main panel did not register')
window.__REACT__ = modules.react
window.__REACTDOM__ = modules.reactDom
window.__FLUSH__ = modules.flushSync
window.__PANEL__ = Panel

await render(window, context, 'down')
if (!String(window.__HTML__).includes('bis-settingsMenu')) {
  throw new Error('the broken header did not render the settings menu')
}
console.log('settings menu rendered')

await render(window, context, 'up')
if (!String(window.__HTML__).includes('bis-settingsMenu')) {
  throw new Error('the start screen did not render the settings menu')
}
console.log('start screen rendered')

await captureHeaderPhases(window, context)
}

export function readAssetsDir(dir) {
  const indexName = readdirSync(dir).find((name) => /^index-.*\.js$/.test(name))
  if (!indexName) throw new Error('no frontend index bundle in ' + dir)
  const index = readFileSync(join(dir, indexName), 'utf8')
  const vendorName = index.match(/from"\.\/(vendor-[^"]+\.js)"/)?.[1]
  if (!vendorName) throw new Error('frontend index does not import a vendor bundle')
  return { index, vendor: readFileSync(join(dir, vendorName), 'utf8') }
}

export function readAsar(asarPath) {
  const fd = openSync(asarPath, 'r')
  try {
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerSize = head.readUInt32LE(4)
    const jsonLen = head.readUInt32LE(12)
    const jsonBuf = Buffer.alloc(jsonLen)
    readSync(fd, jsonBuf, 0, jsonLen, 16)
    const header = JSON.parse(jsonBuf.toString('utf8'))
    const dataOffset = 8 + headerSize
    const read = (entry) => {
      const buf = Buffer.alloc(entry.size)
      readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset))
      return buf.toString('utf8')
    }
    let indexEntry
    let vendorEntry
    const walk = (node, path) => {
      if (!node || !node.files) return
      for (const [name, child] of Object.entries(node.files)) {
        const next = path ? `${path}/${name}` : name
        if (child.files) walk(child, next)
        else if (next.includes('dsh-web-frontend/dist/assets/') && /^index-.*\.js$/.test(name)) indexEntry = child
        else if (next.includes('dsh-web-frontend/dist/assets/') && /^vendor-.*\.js$/.test(name)) vendorEntry = child
      }
    }
    walk(header, '')
    if (!indexEntry || !vendorEntry) throw new Error('frontend bundle is not in the app archive')
    return { index: read(indexEntry), vendor: read(vendorEntry) }
  } finally {
    closeSync(fd)
  }
}

export async function captureModules(context, frontend) {
  const index = frontend.index.replace(
    'const Ls=globalThis.dshDesktopBoot',
    'globalThis.__CAP__=OZ(); throw new Error("CAPTURED"); const Ls=globalThis.dshDesktopBoot',
  )
  const vendor = new vm.SourceTextModule(frontend.vendor, { context, identifier: 'vendor.js' })
  const mod = new vm.SourceTextModule(index, { context, identifier: 'index.js' })
  await vendor.link(() => {
    throw new Error('unexpected vendor import')
  })
  await mod.link(async (specifier) => {
    if (specifier.startsWith('./vendor-')) return vendor
    throw new Error('unexpected import ' + specifier)
  })
  await vendor.evaluate()
  try {
    await mod.evaluate()
  } catch (error) {
    if (error.message !== 'CAPTURED') throw error
  }
  const captured = context.__CAP__
  const primitives = captured && captured['@deepseek-ai/dsh-client-ui-primitives']
  if (!primitives || typeof captured.react.useState !== 'function' || typeof primitives.Menu !== 'function') {
    throw new Error('the frontend bundle did not expose react and the UI primitives')
  }
  return {
    react: captured.react,
    reactDom: captured['react-dom/client'],
    flushSync: captured['react-dom'] && captured['react-dom'].flushSync,
    primitives,
  }
}

export function runFactory(context, file, modules) {
  let thrown
  let plugin
  context.__ModuleLoader__ = {
    load(registration) {
      try {
        plugin = registration.factory((spec) => {
          if (spec === 'react') return modules.react
          if (spec === '@deepseek-ai/dsh-client-ui-primitives') return modules.primitives
          throw new Error('unexpected require ' + spec)
        })
      } catch (error) {
        thrown = error
      }
    },
  }
  vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file })
  if (thrown) {
    console.log('FACTORY THROW', thrown.name + ': ' + thrown.message)
    process.exit(2)
  }
  if (!plugin || typeof plugin.apply !== 'function') throw new Error('client.js did not register a plugin')
  return plugin
}

async function render(window, context, mode) {
  window.__ERRORS__ = []
  window.addEventListener('error', (event) => {
    const error = event.error
    window.__ERRORS__.push(error instanceof Error ? error.name + ': ' + error.message : String(event.message))
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    window.__ERRORS__.push(reason instanceof Error ? reason.name + ': ' + reason.message : String(reason))
  })
  console.error = (...args) => {
    const text = args
      .map((item) => (item instanceof Error ? item.name + ': ' + item.message : typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join(' ')
    if (text && !text.includes('ExperimentalWarning')) window.__ERRORS__.push(text.slice(0, 500))
  }
  window.fetch = async (url) => {
    const path = String(url)
    if (mode === 'down') throw new Error('down')
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
    if (path.includes('/oauth/status')) {
      return json({
        connected: true,
        pending: false,
        refreshable: true,
        account: 'a@example.com',
        mcp: 'mounted',
        version: '0.2.3',
        stale: false,
        updateRequired: false,
      })
    }
    if (path.includes('/bisibility/projects')) {
      return json({
        origin: 'https://bisibility.com',
        projects: [{ id: 'prj_abcdefghijklmnopqrstuvwx', name: 'Example', domain: 'example.com' }],
      })
    }
    if (path.includes('/bisibility/connections')) return json({ searchConsole: { connected: false }, analytics: { connected: false }, providers: [] })
    if (path.includes('/bisibility/overview')) {
      return json({
        origin: 'https://bisibility.com',
        project: { id: 'prj_abcdefghijklmnopqrstuvwx', name: 'Example', domain: 'example.com' },
        checklist: { audit: false, searchConsole: false, analytics: false, keywords: false },
        next: { id: 'audit' },
        audit: null,
        searchConsole: { connected: false },
        analytics: { connected: false, sessions: [] },
        window: { start: '2026-10-01', end: '2026-10-28' },
      })
    }
    if (path.includes('/bisibility/recent')) return json({ origin: 'https://bisibility.com', audits: [], reports: [] })
    if (path.includes('/bisibility/workflows')) return json({ origin: 'https://bisibility.com', workflows: [], categories: [] })
    return json({ error: { message: 'unexpected ' + path } }, 500)
  }
  const mount = window.document.createElement('div')
  window.document.body.appendChild(mount)
  window.__MOUNT__ = mount
  try {
    await vm.runInContext(
      `(async () => {
        const React = globalThis.__REACT__
        const ReactDOM = globalThis.__REACTDOM__
        const flush = globalThis.__FLUSH__ || ((fn) => fn())
        const root = ReactDOM.createRoot(globalThis.__MOUNT__)
        flush(() => root.render(React.createElement(globalThis.__PANEL__, {
          t: (key) => key,
          openPluginsPanel() {},
          startBisibilityPrompt() {},
          localeTag: () => 'en',
        })))
        await new Promise((resolve) => setTimeout(resolve, 50))
      })()`,
      context,
    )
    if (window.happyDOM && typeof window.happyDOM.waitUntilComplete === 'function') {
      await Promise.race([
        window.happyDOM.waitUntilComplete(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ])
    }
  } catch (error) {
    console.log('RENDER THROW', error.name + ': ' + error.message)
    process.exit(3)
  }
  window.__HTML__ = mount.innerHTML || ''
  if (window.__ERRORS__.length > 0) {
    console.log('RENDER ERROR', window.__ERRORS__[0])
    process.exit(3)
  }
}

function headerSignature(root) {
  const header = root.querySelector('header.bis-head')
  if (!header) throw new Error('missing header')
  const parent = header.parentElement
  const parentClass = parent ? String(parent.className) : ''
  if (parentClass !== 'bis-screen') throw new Error('phase wrapper ' + parentClass)
  if (!root.querySelector('.bis-askHeading') || !root.querySelector('.bis-askRow')) throw new Error('ask row moved')
  if (!root.querySelector('.bis-catalog .bis-h2')) throw new Error('section heading moved')
  const slots = [...header.querySelectorAll('[data-slot]')].map((el) => `${el.getAttribute('data-slot')}:${String(el.className)}`)
  return `bis-screen|${slots.join('>')}`
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function waitFor(pred, label) {
  const started = Date.now()
  while (Date.now() - started < 4000) {
    if (pred()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('timed out waiting for ' + label)
}

async function mountPanel(window, context) {
  window.__ERRORS__ = []
  const mount = window.document.createElement('div')
  window.document.body.replaceChildren(mount)
  window.__MOUNT__ = mount
  await vm.runInContext(
    `(async () => {
      const React = globalThis.__REACT__
      const ReactDOM = globalThis.__REACTDOM__
      const flush = globalThis.__FLUSH__ || ((fn) => fn())
      const root = ReactDOM.createRoot(globalThis.__MOUNT__)
      flush(() => root.render(React.createElement(globalThis.__PANEL__, {
        t: (key) => key,
        openPluginsPanel() {},
        startBisibilityPrompt() {},
        localeTag: () => 'en',
      })))
    })()`,
    context,
  )
  return mount
}

async function captureHeaderPhases(window, context) {
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })
  const projectsBody = {
    origin: 'https://bisibility.com',
    projects: [{ id: 'prj_abcdefghijklmnopqrstuvwx', name: 'Example', domain: 'example.com' }],
  }
  const overviewBody = {
    origin: 'https://bisibility.com',
    project: projectsBody.projects[0],
    checklist: { audit: false, searchConsole: false, analytics: false, keywords: false },
    next: { id: 'audit' },
    audit: null,
    searchConsole: { connected: false },
    analytics: { connected: false, sessions: [] },
    window: { start: '2026-10-01', end: '2026-10-28' },
  }
  const connected = {
    connected: true,
    pending: false,
    refreshable: true,
    account: 'a@example.com',
    mcp: 'mounted',
    version: '0.2.3',
    stale: false,
    updateRequired: false,
  }
  const statusGate = deferred()
  const projectsGate = deferred()
  const overviewGate = deferred()
  window.fetch = async (url) => {
    const path = String(url)
    if (path.includes('/oauth/status')) return json(await statusGate.promise)
    if (path.includes('/bisibility/projects')) return json(await projectsGate.promise)
    if (path.includes('/bisibility/connections')) return json({ searchConsole: { connected: false }, analytics: { connected: false }, providers: [] })
    if (path.includes('/bisibility/overview')) return json(await overviewGate.promise)
    if (path.includes('/bisibility/recent')) return json({ origin: 'https://bisibility.com', audits: [], reports: [] })
    if (path.includes('/bisibility/workflows')) return json({ origin: 'https://bisibility.com', workflows: [], categories: [] })
    return json({ error: { message: 'unexpected ' + path } }, 500)
  }
  const mount = await mountPanel(window, context)
  await waitFor(() => mount.querySelector('header.bis-head'), 'boot header')
  const lines = []
  const record = (name) => {
    const line = headerSignature(mount)
    lines.push(line)
    console.log('phase ' + name + ' ' + line)
  }
  record('boot')
  statusGate.resolve(connected)
  await waitFor(() => mount.textContent.includes('status.connected'), 'connected status')
  record('projects')
  projectsGate.resolve(projectsBody)
  await waitFor(() => mount.textContent.includes('example.com'), 'project name')
  record('overview')
  overviewGate.resolve(overviewBody)
  await waitFor(() => mount.textContent.includes('connect.gscOff'), 'overview connection')
  record('loaded')

  window.fetch = async (url) => {
    const path = String(url)
    if (path.includes('/oauth/status')) return json({ connected: false, pending: false, refreshable: false, mcp: 'idle' })
    return json({ error: { message: 'unexpected ' + path } }, 500)
  }
  const signedOut = await mountPanel(window, context)
  await waitFor(() => signedOut.textContent.includes('status.idle'), 'signed out')
  lines.push(headerSignature(signedOut))
  console.log('phase signed-out ' + lines[lines.length - 1])

  window.fetch = async () => {
    throw new Error('down')
  }
  const failed = await mountPanel(window, context)
  await waitFor(() => failed.textContent.includes('status.unreachable'), 'error status')
  lines.push(headerSignature(failed))
  console.log('phase error ' + lines[lines.length - 1])

  if (lines.some((line) => line !== lines[0])) {
    console.log('PHASE MISMATCH')
    process.exit(4)
  }
  if (window.__ERRORS__.length > 0) {
    console.log('RENDER ERROR', window.__ERRORS__[0])
    process.exit(3)
  }
}
