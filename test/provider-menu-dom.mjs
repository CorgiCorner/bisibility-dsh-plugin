import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { captureModules, readAsar, readAssetsDir, runFactory } from '../tools/load-dsh-client.mjs'
import { panelFetch } from './panel-harness.mjs'
import { shapeWorkflows } from '../workflows.js'

const frontend = [process.env.DSH_FRONTEND,
  '/tmp/dsh-asar-yNNB/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
].find((path) => path && existsSync(path))

export function assertNativeProviderMenu() {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', new URL('./provider-menu-dom.mjs', import.meta.url).pathname], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, DSH_PROVIDER_MENU_TEST: '1', DSH_FRONTEND: frontend },
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /native provider keyboard interaction passed/)
}

if (process.env.DSH_PROVIDER_MENU_TEST) await checkNativeProviderMenu()

async function checkNativeProviderMenu() {
  const window = new Window({ url: 'http://127.0.0.1/', width: 1200, height: 800 })
  // Browsers reject focus in a hidden portal; Happy DOM otherwise allows it.
  const focus = window.HTMLElement.prototype.focus
  window.HTMLElement.prototype.focus = function (...args) {
    for (let node = this; node; node = node.parentElement) if (window.getComputedStyle(node).visibility === 'hidden') return
    return focus.apply(this, args)
  }
  const context = vm.createContext(window)
  const modules = await captureModules(context, statSync(frontend).isDirectory() ? readAssetsDir(frontend) : readAsar(frontend))
  const plugin = runFactory(context, process.env.DSH_CLIENT_JS || new URL('../client.js', import.meta.url).pathname, modules)
  const fixture = panelFetch({ handle: (url) => String(url).includes('/bisibility/workflows')
    ? Response.json({ workflows: shapeWorkflows('example.com', 'en'), categories: [] }) : undefined })
  window.fetch = (url, init) => Promise.resolve(fixture.fetchImpl(String(url), init || {}))
  let Panel, dictionaries
  plugin.apply({
    effect(fn) { fn() },
    locale: { register(_namespace, dict) { dictionaries = dict }, bind() { return (key) => dictionaries.en[key] || key } },
    get() { throw new Error('missing') },
    slots: { inject(_name, fn) { fn() }, register(meta, component) { if (meta.name === 'main') Panel = component } },
  })
  const t = (key, vars) => {
    let text = dictionaries.en[key] || key
    for (const [name, value] of Object.entries(vars || {})) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
  const mount = window.document.createElement('div')
  window.document.body.append(mount)
  const root = modules.reactDom.createRoot(mount)
  modules.flushSync(() => root.render(modules.react.createElement(Panel, { t, localeTag: () => 'en', startBisibilityPrompt() {}, openPluginsPanel() {} })))
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(message)
  }
  try {
    await waitFor(() => window.document.querySelector('.bis-providerTrigger'), 'provider trigger did not load')
    const trigger = window.document.querySelector('.bis-providerTrigger')
    trigger.focus()
    trigger.click()
    const option = (id) => window.document.querySelector(`[data-provider="${id}"] input`)
    await waitFor(() => option('all') && window.document.activeElement === option('all'), 'opening must focus the first checkbox')
    assert.equal(window.document.querySelector('.bis-providerMenuList').getAttribute('aria-label'), 'Data providers')
    assert.equal(option('all').getAttribute('role'), 'menuitemcheckbox')
    assert.equal(option('all').getAttribute('aria-checked'), 'true')
    const key = (value) => window.document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
    key('ArrowDown')
    assert.ok(window.document.activeElement === option('dataforseo'), 'ArrowDown must focus DataForSEO')
    key('Enter')
    await waitFor(() => option('dataforseo').checked, 'Enter did not select the provider')
    assert.equal(option('dataforseo').getAttribute('aria-checked'), 'true')
    assert.ok(window.document.querySelector('.bis-providerMenuList'), 'selection must keep the menu open')
    key('ArrowDown')
    assert.ok(window.document.activeElement === option('gsc'), 'ArrowDown must focus Search Console')
    key('Escape')
    await waitFor(() => !window.document.querySelector('.bis-providerMenuList'), 'Escape did not close the menu')
    assert.ok(window.document.activeElement === trigger, 'Escape must restore trigger focus')
    trigger.click()
    await waitFor(() => option('all'), 'menu did not reopen')
    window.document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    window.document.activeElement.blur() // Browser default action on a non-focusable outside target.
    await waitFor(() => !window.document.querySelector('.bis-providerMenuList'), 'outside pointer did not close the menu')
    await waitFor(() => window.document.activeElement === trigger, 'outside dismissal must restore trigger focus')
    trigger.click()
    await waitFor(() => option('all') && window.document.activeElement === option('all'), 'menu did not focus on reopen')
    key('Tab')
    await waitFor(() => !window.document.querySelector('.bis-providerMenuList'), 'Tab did not close the menu')
    assert.ok(window.document.activeElement === trigger, 'Tab must restore trigger focus')
    const outside = window.document.createElement('button')
    window.document.body.append(outside)
    trigger.click()
    await waitFor(() => option('all'), 'menu did not reopen before outside control click')
    outside.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    outside.focus()
    await waitFor(() => !window.document.querySelector('.bis-providerMenuList'), 'outside control did not close the menu')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.ok(window.document.activeElement === outside, 'outside control must keep its focus')
    console.log('native provider keyboard interaction passed')
  } finally {
    root.unmount()
    await window.happyDOM.close()
  }
}
