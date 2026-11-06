import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const PROJECT = 'prj_abcdefghijklmnopqrstuvwx'
const OTHER = 'prj_zzzzzzzzzzzzzzzzzzzzzzzz'

/**
 * A hook runner small enough to mount the panel and click what it renders.
 * Function components are expanded during render so their hooks stay ordered.
 */
function createRenderer() {
  const hookState = []
  let index = 0
  let tree = null
  let dirty = false
  let rendering = false

  function slot() {
    const current = index
    index += 1
    if (hookState[current] === undefined) hookState[current] = {}
    return hookState[current]
  }

  const React = {
    createElement(type, props, ...children) {
      const flat = []
      const push = (value) => {
        if (Array.isArray(value)) {
          for (const item of value) push(item)
          return
        }
        if (value === null || value === undefined || value === false || value === true) return
        flat.push(value)
      }
      for (const child of children) push(child)
      return { type, props: { ...(props ?? {}), children: flat } }
    },
    useState(initial) {
      const hook = slot()
      if (hook.state === undefined) hook.state = typeof initial === 'function' ? initial() : initial
      const setState = (next) => {
        const value = typeof next === 'function' ? next(hook.state) : next
        if (Object.is(value, hook.state)) return
        hook.state = value
        dirty = true
      }
      return [hook.state, setState]
    },
    useRef(initial) {
      const hook = slot()
      if (hook.ref === undefined) hook.ref = { current: initial }
      return hook.ref
    },
    useCallback(fn, deps) {
      const hook = slot()
      if (hook.fn === undefined || !same(hook.deps, deps)) {
        hook.fn = fn
        hook.deps = deps
      }
      return hook.fn
    },
    useLayoutEffect(effect, deps) {
      React.useEffect(effect, deps)
    },
    useEffect(effect, deps) {
      const hook = slot()
      hook.effect = effect
      hook.deps = deps
    },
  }

  function expand(node) {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    const children = node.props.children.map((child) => expand(child))
    return { type: node.type, props: { ...node.props, children } }
  }

  function runEffects() {
    for (const hook of hookState) {
      if (hook === undefined || hook.effect === undefined) continue
      if (hook.ran === true && same(hook.prev, hook.deps)) continue
      if (typeof hook.cleanup === 'function') hook.cleanup()
      hook.prev = hook.deps
      hook.ran = true
      const cleanup = hook.effect()
      hook.cleanup = typeof cleanup === 'function' ? cleanup : null
    }
  }

  function render(Component, props) {
    rendering = true
    index = 0
    tree = expand(React.createElement(Component, props))
    rendering = false
    runEffects()
    return tree
  }

  return {
    React,
    get tree() {
      return tree
    },
    get dirty() {
      return dirty
    },
    render,
    consumeDirty() {
      const value = dirty
      dirty = false
      return value
    },
    rendering: () => rendering,
  }
}

function same(left, right) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((item, i) => Object.is(item, right[i]))
}

/**
 * @param {object} node
 * @param {(node: object) => void} visit
 */
export function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return
  visit(node)
  const children = node.props?.children
  if (!Array.isArray(children)) return
  for (const child of children) walk(child, visit)
}

/**
 * @param {object} node
 * @returns {string}
 */
export function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node !== 'object' || node.props === undefined) return ''
  return node.props.children.map((child) => textOf(child)).join('')
}

/**
 * @param {object} node
 * @param {(node: object) => boolean} predicate
 * @returns {object | null}
 */
export function findNode(node, predicate) {
  let found = null
  walk(node, (item) => {
    if (found === null && predicate(item)) found = item
  })
  return found
}

/**
 * Stand-ins for `@deepseek-ai/dsh-client-ui-primitives`.
 * They keep the visible text, clicks, and menu items the panel tests exercise.
 * @param {typeof import('react')} React
 */
function primitiveStubs(React) {
  const element = React.createElement
  const buttonProps = (props) => ({
    type: props.type || 'button',
    className: props.className,
    disabled: props.disabled,
    onClick: props.onClick,
    'aria-label': props['aria-label'],
    'aria-haspopup': props['aria-haspopup'],
    'aria-expanded': props['aria-expanded'],
    'aria-controls': props['aria-controls'],
    'aria-pressed': props['aria-pressed'],
    'aria-current': props['aria-current'],
    id: props.id,
    'data-variant': props.variant,
    'data-size': props.size ?? null,
    'data-skill': props['data-skill'],
    'data-audit': props['data-audit'],
    ...Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-'))),
  })
  const named = (name) =>
    function Primitive(props) {
      const safe = props ?? {}
      const children = safe.children
      if (name === 'Input') {
        const input = element('input', {
          id: safe.id,
          className: safe.className,
          type: safe.type || 'text',
          value: safe.value,
          placeholder: safe.placeholder,
          autoComplete: safe.autoComplete,
          onChange: safe.onChange,
          'aria-label': safe['aria-label'],
          'data-size': safe.size ?? null,
        })
        return safe.icon ? element('span', { className: 'bis-inputHost' }, safe.icon, input) : input
      }
      if (name === 'Button' || name === 'Pill') {
        return element('button', { ...buttonProps(safe), 'data-primitive': name }, children)
      }
      if (name === 'Checkbox') {
        return element('label', { className: safe.className, 'data-primitive': 'Checkbox' },
          element('input', { type: 'checkbox', checked: safe.checked, disabled: safe.disabled, onChange: (event) => safe.onChange(event.target.checked) }),
          element('span', {}, safe.label),
        )
      }
      if (name === 'MenuItemButton') return element('button', { type: 'button', role: 'menuitem', 'aria-current': safe.current ? 'page' : undefined, onClick: safe.onSelect, 'data-primitive': name }, children)
      if (name === 'SegmentedTabs' || name === 'SegmentedControl') {
        const items = safe.items || safe.options || []
        return element(
          'div',
          { role: 'tablist', 'aria-label': safe.label, className: safe.className },
          items.map((item) =>
            element(
              'button',
              {
                type: 'button',
                key: item.value,
                role: 'tab',
                'aria-selected': item.value === safe.value ? 'true' : 'false',
                onClick: () => safe.onChange?.(item.value),
              },
              item.label,
            ),
          ),
        )
      }
      if (name === 'Menu') {
        if (safe.open !== true) return safe.anchor ? element('span', { className: safe.className }, safe.anchor) : null
        const items = Array.isArray(safe.items) ? safe.items : []
        const menu = element(
          'div',
          {
            role: 'menu',
            className: safe.listClassName,
            'data-side': safe.side ?? null,
            'data-align': safe.align ?? null,
            'data-placement': safe.placement ?? null,
            'data-avoid-collisions': safe.avoidCollisions === true ? 'true' : null,
            'data-collision-padding': safe.collisionPadding ?? null,
            'data-portal': safe.portal === true ? 'true' : null,
            'data-native-anchor': safe.anchor ? 'true' : null,
          },
          items.map((item) =>
            item.type === 'separator'
              ? element('div', { key: item.id, role: 'separator' })
              : item.type === 'label'
                ? element('div', { key: item.id, className: item.className, role: 'presentation' }, item.text || '')
                : element(
                    'button',
                    {
                      type: 'button',
                      key: item.id,
                      role: 'menuitem',
                      onClick: () => safe.onSelect?.(item.id),
                    },
                    item.label,
                  ),
          ),
          children,
        )
        return safe.anchor ? element('span', {}, safe.anchor, menu) : menu
      }
      if (name === 'DisclosureRow') {
        return element(
          'div',
          { className: safe.className },
          element(
            'button',
            { type: 'button', 'aria-expanded': safe.open === true ? 'true' : 'false', onClick: safe.onToggle },
            safe.title,
          ),
          safe.open === true ? children : null,
        )
      }
      if (name === 'StateDot') return element('span', { 'data-state': safe.state, 'data-primitive': 'StateDot' })
      if (name === 'Modal') {
        if (safe.open !== true) return null
        const header = element(
          'div',
          { className: 'bis-modalHeader' },
          element('h2', { className: 'bis-modalTitle' }, safe.title ?? ''),
          element(
            'button',
            { type: 'button', className: 'bis-modalClose', 'aria-label': safe.closeLabel || 'Close', onClick: safe.onClose },
            '×',
          ),
        )
        const meta =
          typeof safe.description === 'string' && safe.description !== ''
            ? element('p', { className: 'bis-modalMeta' }, safe.description)
            : null
        const body = element('div', { className: 'bis-modalBody' }, children)
        const contentClass =
          typeof safe.contentClassName === 'string' && safe.contentClassName !== '' ? safe.contentClassName : 'bis-modalContent'
        const content = element('div', { className: contentClass }, header, meta, body)
        const footer = safe.footer != null ? element('div', { className: 'bis-modalFooter' }, safe.footer) : null
        const dialogClass = typeof safe.className === 'string' && safe.className !== '' ? safe.className : 'bis-modal'
        return element(
          'div',
          { role: 'dialog', 'aria-modal': 'true', 'aria-label': safe.title, className: dialogClass },
          content,
          footer,
        )
      }
      if (name === 'Toast') return element('div', { role: 'alert', 'data-primitive': 'Toast', onDone: safe.onDone }, safe.text, (safe.actions || []).map((action) => element('button', { key: action.label, type: 'button', onClick: action.onClick, 'data-primitive': 'ToastAction' }, action.label)))
      if (name === 'Tooltip' && safe.disabled === true) return children[0] ?? null
      if (name === 'Tooltip') return element('span', { className: safe.className, 'data-tooltip': safe.content ?? safe.label ?? null }, children)
      if (name === 'Tag') return element('span', { className: safe.className, 'data-primitive': 'Tag' }, children ?? safe.label ?? null)
      if (name.startsWith('Icon')) return element('span', { 'data-icon': name, 'aria-hidden': 'true' })
      return element('div', { 'data-primitive': name }, children)
    }
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (name === '__esModule') return true
        return named(String(name))
      },
    },
  )
}

/**
 * Mount the client panel against a scripted fetch.
 * @param {object} options
 * @param {(url: string, init: RequestInit) => Promise<Response> | Response} options.fetch
 * @param {string} [options.language]
 * @returns {Promise<{ tree: () => object, prompts: string[], location: { href: string, assigned: string | null }, opens: string[], focus: () => void, settle: () => Promise<void> }>}
 */
export async function mountPanel({ fetch: fetchImpl, language = 'en-US', now = () => Date.now(), startPrompt }) {
  const prompts = []
  const drafts = []
  const opens = []
  const listeners = new Map()
  const location = {
    href: 'http://127.0.0.1:9/',
    assigned: null,
    assign(url) {
      this.assigned = String(url)
      this.href = String(url)
    },
    reload() {},
  }
  const window = {
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      list.push(fn)
      listeners.set(type, list)
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? []
      listeners.set(
        type,
        list.filter((item) => item !== fn),
      )
    },
    open(url) {
      opens.push(String(url))
      return null
    },
    location,
    document: null,
  }
  const document = {
    documentElement: { lang: language },
    getElementById() {
      return null
    },
    createElement(tag) {
      const element = {
        tag,
        clicked: false,
        href: '',
        target: '',
        rel: '',
        click() {
          this.clicked = true
        },
        remove() {},
      }
      return element
    },
    body: {
      appendChild() {},
      removeChild() {},
    },
  }
  window.document = document
  let factory = null
  window.__ModuleLoader__ = {
    load(definition) {
      factory = definition.factory
    },
  }
  const renderer = createRenderer()
  let dictionaries = null
  const ctx = {
    slots: {
      inject(_name, fn) {
        fn()
      },
      register(spec, component) {
        ctx.registered.push({ spec, component })
        return () => {}
      },
    },
    locale: {
      register(_ns, dict) {
        dictionaries = dict
        return () => {}
      },
      bind() {
        return (key, vars) => {
          const table = dictionaries?.en ?? {}
          let text = typeof table[key] === 'string' ? table[key] : key
          if (vars !== null && typeof vars === 'object') {
            for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
          }
          return text
        }
      },
    },
    effect(fn) {
      return fn()
    },
    get() {
      return undefined
    },
    registered: [],
  }
  const sandbox = {
    window,
    document,
    navigator: { language },
    fetch: (url, init) => Promise.resolve(fetchImpl(String(url), init ?? {})),
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    URL,
    URLSearchParams,
    Intl,
    Date: class extends Date { static now() { return now() } },
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    TypeError,
    Promise,
    Map,
    Set,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    isNaN,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), sandbox, { filename: 'client.js' })
  if (factory === null) throw new Error('client.js did not expose a factory')
  const plugin = factory((id) => {
    if (id === 'react') return renderer.React
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitiveStubs(renderer.React)
    throw new Error(`unexpected require ${id}`)
  })
  plugin.apply(ctx)
  const panel = ctx.registered.find((entry) => entry.spec.name === 'main')
  if (panel === undefined) throw new Error('the panel slot was not registered')
  const locale = language.startsWith('zh') ? 'zh' : 'en'
  const t = (key, vars) => {
    const table = dictionaries?.[locale] ?? {}
    let text = typeof table[key] === 'string' ? table[key] : key
    if (vars !== null && typeof vars === 'object') {
      for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
  const props = {
    t,
    startBisibilitySession() {},
    openPluginsPanel() {},
    startBisibilityPrompt(prompt, options) {
      prompts.push(prompt)
      drafts.push(options ?? null)
      return startPrompt ? startPrompt(prompt, options) : { status: 'ready' }
    },
    localeTag: () => language,
  }
  const settle = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const wasDirty = renderer.consumeDirty()
      if (wasDirty || attempt === 0) renderer.render(panel.component, props)
      await new Promise((resolve) => setImmediate(resolve))
      if (!renderer.dirty) {
        await new Promise((resolve) => setImmediate(resolve))
        if (!renderer.dirty) return
      }
    }
    throw new Error('the panel did not settle')
  }
  renderer.render(panel.component, props)
  await settle()
  return {
    tree: () => renderer.tree,
    prompts,
    drafts,
    location,
    opens,
    focus() {
      for (const fn of listeners.get('focus') ?? []) fn()
    },
    press(key) {
      for (const fn of listeners.get('keydown') ?? []) fn({ key })
    },
    settle,
    render: () => renderer.render(panel.component, props),
  }
}

export const PANEL_PROJECT = PROJECT
export const PANEL_OTHER = OTHER

/**
 * A connected panel with two projects and a scriptable overview.
 * @param {object} [options]
 * @param {(projectId: string) => object} [options.overview]
 * @param {(url: string, init: RequestInit) => Promise<Response> | Response | undefined} [options.handle]
 * @param {(projectId: string) => object} [options.projectData] answers GET /bisibility/project-data; by default
 *   the Search Console and Analytics cards of the scripted overview, so a fixture can keep its numbers in one place.
 */
export function panelFetch({ overview, handle, projects, projectData } = {}) {
  const calls = []
  const projectRows =
    projects !== undefined
      ? projects
      : [
          { id: PROJECT, name: 'Example', domain: 'example.com' },
          { id: OTHER, name: 'Other', domain: 'other.example' },
        ]
  const fetchImpl = (url, init = {}) => {
    calls.push({ url, init })
    if (handle !== undefined) {
      const answered = handle(url, init)
      if (answered !== undefined) return answered
    }
    if (url.includes('/oauth/status')) {
      return Response.json({
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
    if (url.includes('/bisibility/projects')) {
      return Response.json({
        origin: 'https://bisibility.com',
        projects: projectRows,
      })
    }
    if (url.includes('/bisibility/connections')) {
      const id = new URL(url, 'http://127.0.0.1').searchParams.get('project')
      const full = overview !== undefined ? overview(id) : disconnectedOverview(id)
      return Response.json({ searchConsole: full.searchConsole, analytics: full.analytics, providers: full.providers })
    }
    if (url.includes('/bisibility/overview')) {
      const id = new URL(url, 'http://127.0.0.1').searchParams.get('project')
      const body = overview !== undefined ? overview(id) : disconnectedOverview(id)
      return Response.json(body)
    }
    if (url.includes('/bisibility/project-data')) {
      const id = new URL(url, 'http://127.0.0.1').searchParams.get('project')
      const full = overview !== undefined ? overview(id) : disconnectedOverview(id)
      const body = projectData !== undefined ? projectData(id) : { searchConsole: full.searchConsole, analytics: full.analytics, window: full.window }
      if (body.indexing === undefined) body.indexing = body.searchConsole?.indexing ?? { notIndexed: null, urls: [], error: null }
      return Response.json({ origin: 'https://bisibility.com', ...body })
    }
    if (url.includes('/bisibility/recent')) {
      return Response.json({ origin: 'https://bisibility.com', audits: [], reports: [] })
    }
    if (url.includes('/bisibility/workflows')) {
      return Response.json({ origin: 'https://bisibility.com', workflows: [], categories: [] })
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 })
  }
  return { fetchImpl, calls }
}

/**
 * Overview whose next step is a site audit and whose providers are not connected.
 * @param {string | null} projectId
 */
export function disconnectedOverview(projectId) {
  const domain = projectId === OTHER ? 'other.example' : 'example.com'
  return {
    origin: 'https://bisibility.com',
    project: { id: projectId, name: domain, domain },
    checklist: { audit: false, searchConsole: false, analytics: false, keywords: false },
    next: { id: 'audit' },
    audit: null,
    searchConsole: {
      connected: false,
      needsReauth: false,
      status: 'not_connected',
      clicks: null,
      impressions: null,
      previous: null,
      queries: [],
      truncated: false,
      indexing: null,
      error: null,
    },
    analytics: { connected: false, needsReauth: false, status: 'not_connected', sessions: [], error: null },
    window: { start: '2026-10-01', end: '2026-10-28' },
  }
}
