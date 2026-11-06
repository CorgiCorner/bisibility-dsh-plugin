import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

/**
 * DSH materializes client.js by calling the factory. A throw there, or while
 * the main slot first paints, is reported as "import failed" with no stack in
 * the boot log. The UI primitives are not a package on disk. They are the
 * seed module inside the DeepSeek Harness frontend, so this runs the factory
 * against that module.
 */
function frontendSource() {
  if (process.env.DSH_FRONTEND && existsSync(process.env.DSH_FRONTEND)) return process.env.DSH_FRONTEND
  const candidates = [
    '/tmp/dsh-asar-yNNB/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
  ]
  return candidates.find((path) => existsSync(path))
}

const frontend = frontendSource()
const client = process.env.DSH_CLIENT_JS || new URL('../client.js', import.meta.url).pathname

test('client.js loads through the real DSH primitives', { skip: frontend ? false : 'DeepSeek Harness frontend bundle is not on this machine' }, () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--disable-warning=ExperimentalWarning',
      new URL('../tools/load-dsh-client.mjs', import.meta.url).pathname,
      frontend,
      client,
    ],
    { encoding: 'utf8', timeout: 90000 },
  )
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  assert.equal(result.status, 0, output)
  assert.match(result.stdout, /factory ok/)
  assert.match(result.stdout, /settings menu rendered/)
  assert.match(result.stdout, /start screen rendered/)
  const phases = [...output.matchAll(/^phase \S+ (.+)$/gm)].map((match) => match[1])
  const plantedSlot = phases.map((line, index) => (index === 2 ? line.replace('project:bis-projectSlot', 'project:bis-bootOnly') : line))
  assert.throws(() => assertHeaderPhases(plantedSlot), /missing slot/)
  const plantedWrap = phases.map((line, index) => (index === 0 ? line.replace('bis-screen|', 'bis-phaseWrap|') : line))
  assert.throws(() => assertHeaderPhases(plantedWrap), /header structure/)
  assertHeaderPhases(phases)
})

function assertHeaderPhases(lines) {
  if (!Array.isArray(lines) || lines.length < 6) throw new Error('missing phase')
  const required = ['mark:bis-mark', 'title:bis-title', 'project:bis-projectSlot', 'status:bis-connected', 'statusText:bis-statusLabel', 'settings:bis-settingsAnchor']
  for (const line of lines) {
    if (!line.startsWith('bis-screen|')) throw new Error('header structure changed')
    for (const slot of required) {
      if (!line.includes(slot)) throw new Error('missing slot ' + slot)
    }
    if (line !== lines[0]) throw new Error('header structure changed')
  }
}
