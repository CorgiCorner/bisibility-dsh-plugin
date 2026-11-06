import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { captureModules, readAsar, readAssetsDir, runFactory } from '../tools/load-dsh-client.mjs'

const frontend = [process.env.DSH_FRONTEND,
  '/tmp/dsh-asar-yNNB/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
].find((path) => path && existsSync(path))

export const tooltipDOMOptions = { skip: frontend ? false : 'DeepSeek Harness frontend bundle is not on this machine' }

export function assertTooltipDOM(scenario) {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', new URL('./tooltip-dom.mjs', import.meta.url).pathname], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DSH_TOOLTIP_CASE: scenario, DSH_FRONTEND: frontend },
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /native tooltip positives and negatives passed/)
}

if (process.env.DSH_TOOLTIP_CASE) await checkTooltips(process.env.DSH_TOOLTIP_CASE)

async function checkTooltips(scenario) {
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-tooltip-dom-'))
  const window = new Window({ url: 'http://127.0.0.1/', width: 1200, height: 800 })
  let root
  try {
    const context = vm.createContext(window)
    const modules = await captureModules(context, statSync(frontend).isDirectory() ? readAssetsDir(frontend) : readAsar(frontend))
    // Expose the actual internal components without changing their implementation.
    const source = readFileSync(process.env.DSH_CLIENT_JS || new URL('../client.js', import.meta.url), 'utf8')
    const marker = '    function ResultRow('
    assert.equal(source.split(marker).length, 2)
    const file = join(scratch, 'client.js')
    writeFileSync(file, source.replace(marker, '    window.__tooltipComponents = { ResultRow, TruncatedTooltip };\n' + marker))
    runFactory(context, file, modules)
    const { ResultRow, TruncatedTooltip } = window.__tooltipComponents
    const { document } = window
    let available = 180
    // Happy DOM has no layout engine. Stub dimensions only; refs, React, native
    // Tooltip event delivery and DOM focus are real. Chrome verifies actual layout.
    Object.defineProperties(window.HTMLElement.prototype, {
      clientWidth: { configurable: true, get() { return available } },
      scrollWidth: { configurable: true, get() { return this.textContent.length * 8 } },
    })
    const observers = new Set()
    window.ResizeObserver = class {
      constructor(callback) { this.callback = callback }
      observe() { observers.add(this); queueMicrotask(() => this.deliver()) }
      disconnect() { observers.delete(this) }
      deliver() { this.callback([{ borderBoxSize: [{ inlineSize: 180, blockSize: 40 }] }]) }
    }
    let finishFonts
    const fonts = new window.EventTarget()
    fonts.ready = new Promise((resolve) => { finishFonts = resolve })
    Object.defineProperty(document, 'fonts', { value: fonts })
    const title = 'Saved report with a title much longer than the available result row'
    const meta = 'https://example.com/reports/a-very-long-saved-result-address'
    const url = 'https://example.com/a-very-long-finding-address-that-must-be-readable'
    const h = modules.react.createElement
    const mount = document.createElement('div')
    document.body.append(mount)
    root = modules.reactDom.createRoot(mount)
    modules.flushSync(() => root.render(h('div', {},
      h('ul', {},
        h(ResultRow, { title, meta, buttonProps: { id: 'long-row' }, onOpen() {} }),
        h(ResultRow, { title: 'Short report', meta: 'Saved', buttonProps: { id: 'short-row' }, onOpen() {} }),
        h(ResultRow, { title: 'Fits', meta, history: true, buttonProps: { id: 'mixed-row' }, onOpen() {} }),
        h(ResultRow, { title, meta: 'Saved', buttonProps: { id: 'title-only-row' }, onOpen() {} })),
      h(TruncatedTooltip, { label: url, render: (ref) => h('a', { id: 'long-url', ref, href: url }, url) }),
      h(TruncatedTooltip, { label: 'https://example.com', render: (ref) => h('a', { id: 'short-url', ref, href: 'https://example.com' }, 'https://example.com') }),
    )))
    const settle = () => new Promise((resolve) => setTimeout(resolve, 25))
    await settle()
    const tooltipText = () => [...document.querySelectorAll('[role="tooltip"]')].map((node) => node.textContent).join('\n')
    const mouse = (node, enter) => {
      node.dispatchEvent(new window.Event(enter ? 'pointerenter' : 'pointerleave'))
      node.dispatchEvent(new window.MouseEvent(enter ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: document.body }))
    }
    const focus = (node) => {
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      node.focus()
      assert.equal(document.activeElement, node)
    }
    const clear = async () => {
      document.activeElement?.blur()
      for (const node of document.querySelectorAll('button, a, .bis-recentName, .bis-recentMeta')) mouse(node, false)
      await settle()
      assert.equal(tooltipText(), '')
    }
    const long = document.getElementById('long-row')
    const short = document.getElementById('short-row')
    if (scenario === 'rows') {
      // Hover both text parts, then focus the single row control (no child tab stop).
      for (const selector of ['.bis-recentName', '.bis-recentMeta']) {
        mouse(long.querySelector(selector), true)
        await settle()
        assert.ok(tooltipText().includes(selector.endsWith('Name') ? title : meta), 'truncated row must show its full text on hover')
        await clear()
      }
      focus(long)
      await settle()
      assert.ok(tooltipText().includes(title), 'row keyboard focus must reveal the full truncated title')
      assert.ok(tooltipText().includes(meta), 'row keyboard focus must reveal the full truncated metadata')
      assert.equal(long.querySelector('[tabindex]'), null, 'no extra row tab stop')
      await clear()
      for (const [id, expected] of [['mixed-row', meta], ['title-only-row', title]]) {
        const row = document.getElementById(id)
        for (const activate of [(node) => mouse(node, true), focus]) {
          activate(row)
          await settle()
          assert.equal(tooltipText(), expected, 'only the truncated text belongs in the row hint')
          await clear()
        }
      }
      for (const node of [short, document.getElementById('short-url')]) {
        mouse(node, true)
        await settle()
        assert.equal(tooltipText(), '', 'fitting text must not show a hover tooltip')
        await clear()
        focus(node)
        await settle()
        assert.equal(tooltipText(), '', 'fitting text must not show a focus tooltip')
        await clear()
      }
      const link = document.getElementById('long-url')
      for (const activate of [(node) => mouse(node, true), focus]) {
        activate(link)
        await settle()
        assert.equal(tooltipText(), url, 'truncated URL must show its full tooltip on hover and focus')
        await clear()
      }
    } else {
      for (const refresh of [() => window.dispatchEvent(new window.Event('resize')), () => { for (const observer of observers) observer.deliver() }, () => fonts.dispatchEvent(new window.Event('loadingdone')), finishFonts]) {
        available = 2000
        refresh()
        await settle()
        mouse(long.querySelector('.bis-recentName'), true)
        await settle()
        assert.equal(tooltipText(), '', 'text that fits after resizing/fonts must lose its tooltip')
        await clear()
        focus(long)
        await settle()
        assert.equal(tooltipText(), '', 'fitting row focus must stay tooltip-free after resizing/fonts')
        await clear()
        available = 180
        refresh === finishFonts ? fonts.dispatchEvent(new window.Event('loadingdone')) : refresh()
        await settle()
        mouse(long.querySelector('.bis-recentName'), true)
        await settle()
        assert.ok(tooltipText().includes(title), 'text that truncates again must regain its hover tooltip')
        await clear()
        focus(long)
        await settle()
        assert.ok(tooltipText().includes(title), 'text that truncates again must regain its focus tooltip')
        await clear()
      }
    }
    assert.equal(document.querySelector('[title]'), null, 'native title bypasses truncation')
    console.log('native tooltip positives and negatives passed: ' + scenario)
  } finally {
    if (root) root.unmount()
    await window.happyDOM.close()
    rmSync(scratch, { recursive: true, force: true })
  }
}
