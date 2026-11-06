import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROVIDER_SKILLS, PROVIDER_SENTENCES, providerPrompt, shapeWorkflows } from '../workflows.js'
import { disconnectedOverview, findNode, mountPanel, panelFetch, PANEL_OTHER, PANEL_PROJECT, textOf, walk } from './panel-harness.mjs'
import { assertTooltipDOM, tooltipDOMOptions } from './tooltip-dom.mjs'
import { assertNativeProviderMenu } from './provider-menu-dom.mjs'

const focusSelectors = '.bis-page :focus-visible,.bis-modalRoot :focus-visible,.bis-menuList.bis-menuList :focus-visible,.bis-askField:focus-within:has(:focus-visible),.bis-catalogSearch:focus-within:has(:focus-visible),.bis-toastMessage~button:focus-visible'

function serveWorkflows(handle) {
  const workflows = shapeWorkflows('example.com', 'en')
  return (url, init) => {
    if (String(url).includes('/bisibility/workflows')) {
      return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
    }
    return typeof handle === 'function' ? handle(url, init) : undefined
  }
}

function assertFailureBlock(node, raw, sentence = 'Project data could not load.') {
  if (node === null || node === undefined) throw new Error('missing failure')
  const main = findNode(node, (item) => item.props?.className === 'bis-failureText')
  const label = textOf(main)
  if (label === raw || label.includes('unreadable response')) throw new Error('raw tool text')
  if (label !== sentence) throw new Error('failure sentence')
  if (textOf(node).includes(raw)) throw new Error('raw tool text')
  if (findNode(node, (item) => item.type === 'button' && textOf(item) === 'Retry') === null) throw new Error('retry')
}

function assertDataCards(queriesText, alertText) {
  if (queriesText.includes('Estimate first')) throw new Error('estimate label')
  if (!queriesText.includes('Search Console')) throw new Error('search console label')
  if (alertText.includes('Review changes')) throw new Error('review changes')
  if (!alertText.includes('Review alerts')) throw new Error('review alerts')
  if (alertText.includes('Add keywords')) throw new Error('keywords label')
  if (!alertText.includes('No alerts yet')) throw new Error('alerts label')
}

function skillCardText(tree, skill) {
  const card = findNode(
    tree,
    (node) => node.props?.className === 'bis-skillCard' && findNode(node, (child) => child.props?.['data-skill'] === skill) !== null,
  )
  return textOf(card)
}

async function openAuditPreparation(panel) {
  findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-skill'] === 'seo-audit').props.onClick()
  await panel.settle()
}

async function openSkillAudit(panel) {
  const latest = findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-audit'] === 'latest')
  const run = findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-skill'] === 'seo-audit')
  ;(latest ?? run).props.onClick()
  await panel.settle()
}

test('connect opens the providers page in a new browsing context and leaves the harness in place', async () => {
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const connect = findNode(panel.tree(), (node) => node.type === 'button' || node.type === 'a' ? textOf(node) === 'Connect Search Console' : false)
  assert.ok(connect, 'Connect Search Console is on the page')
  assert.equal(connect.type, 'a')
  assert.equal(connect.props.target, '_blank')
  assert.match(connect.props.rel, /noopener/)
  assert.match(connect.props.rel, /noreferrer/)
  assert.equal(
    connect.props.href,
    `https://bisibility.com/app/${PANEL_PROJECT}/providers?connect=gsc#provider-gsc`,
  )
  if (typeof connect.props.onClick === 'function') connect.props.onClick()
  assert.equal(panel.location.assigned, null)
  assert.equal(panel.location.href, 'http://127.0.0.1:9/')
  assert.equal(panel.opens.length, 0)
})

test('the featured Search Console step uses the same external link', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist.audit = true
      body.next = { id: 'search-console' }
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        createdAt: '2026-10-28T12:00:00.000Z',
        cached: false,
        pagesCrawled: 3,
        stopReason: 'finished',
        topIssues: [],
      }
      return body
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const link = findNode(
    panel.tree(),
    (node) => (node.type === 'a' || node.type === 'button') && textOf(node) === 'Connect Search Console',
  )
  assert.ok(link)
  assert.equal(link.type, 'a')
  assert.equal(link.props.target, '_blank')
  assert.match(link.props.rel, /noopener/)
  assert.match(link.props.rel, /noreferrer/)
  assert.match(link.props.href, /connect=gsc#provider-gsc$/)
  assert.equal(panel.location.assigned, null)
})

test('switching project drops an audit that finished for the previous project', async () => {
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const { fetchImpl, calls } = panelFetch({
    handle: serveWorkflows((url, init) => {
      if (url.includes('/bisibility/audit') && init.method === 'POST') {
        return pending.then(() =>
          Response.json({
            origin: 'https://bisibility.com',
            audit: {
              id: 'agr_abcdefghijklmnopqrstuvwx',
              createdAt: '2026-10-28T12:00:00.000Z',
              cached: false,
              pagesCrawled: 12,
              stopReason: 'page_limit',
              topIssues: [],
            },
          }),
        )
      }
      return undefined
    }),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const run = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit')
  assert.ok(run)
  run.props.onClick()
  const opener = findNode(panel.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Project')
  assert.ok(opener)
  opener.props.onClick()
  await panel.settle()
  const other = findNode(panel.tree(), (node) => node.props?.role === 'menuitem' && textOf(node).includes('other.example'))
  assert.ok(other)
  other.props.onClick()
  await panel.settle()
  release()
  await panel.settle()
  const shown = textOf(panel.tree())
  assert.equal(shown.includes('12 pages crawled'), false)
  assert.equal(shown.includes('agr_abcdefghijklmnopqrstuvwx'), false)
  const posted = calls.filter((call) => call.url.includes('/bisibility/audit') && call.init.method === 'POST')
  assert.equal(posted.length, 1)
  assert.match(posted[0].init.body, new RegExp(PANEL_PROJECT))
})

test('a burst of window focus does not reload the panel again inside a minute', async () => {
  const { fetchImpl, calls } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const loads = () => calls.filter((call) => /\/bisibility\/(projects|overview|recent|workflows)/.test(call.url)).length
  const before = loads()
  for (let i = 0; i < 8; i += 1) panel.focus()
  await new Promise((resolve) => setTimeout(resolve, 400))
  await panel.settle()
  assert.equal(loads(), before)
  const now = Date.now
  Date.now = () => now() + 61_000
  try {
    panel.focus()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await panel.settle()
    assert.ok(loads() > before)
  } finally {
    Date.now = now
  }
})

test('the analytics total is the newest point, not the sum of the series', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist.analytics = true
      body.analytics = {
        connected: true,
        needsReauth: false,
        status: 'connected',
        sessions: [
          { date: '2026-10-01', sessions: 1000 },
          { date: '2026-10-02', sessions: 1100 },
        ],
        error: null,
      }
      return body
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const opener = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data')
  assert.ok(opener)
  opener.props.onClick()
  await panel.settle()
  const card = findNode(panel.tree(), (node) => node.props?.className === 'bis-metrics')
  assert.ok(card, 'project data')
  const shown = textOf(card)
  assert.match(shown, /1,100/)
  assert.equal(shown.includes('2,100'), false)
  assert.match(shown, /Keyword page sessions/)
})

test('an empty question does nothing and a chip prefills its skill', async () => {
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  assert.match(shown, /What would you like to improve\?/)
  assert.match(shown, /Ask bisibility/)
  const askInput = findNode(panel.tree(), (node) => node.props?.id === 'bis-ask')
  assert.equal(askInput.props.placeholder, 'Ask about example.com…')
  assert.equal(shown.includes('Show my search queries'), false)
  assert.equal(shown.includes('Why did my traffic drop?'), false)
  const form = findNode(panel.tree(), (node) => node.type === 'form' && node.props.className === 'bis-ask')
  form.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(panel.prompts, [])
  const audit = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Preview a first audit')
  audit.props.onClick()
  assert.equal(panel.prompts[0], '/seo-audit Preview a first audit for example.com')
  const compare = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Compare a competitor')
  compare.props.onClick()
  assert.equal(panel.prompts[1], '/competitor-analysis Compare a competitor for example.com')
  const input = findNode(panel.tree(), (node) => node.props?.id === 'bis-ask')
  input.props.onChange({ target: { value: 'Why did traffic drop' } })
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'form' && node.props.className === 'bis-ask').props.onSubmit({
    preventDefault() {},
  })
  assert.equal(panel.prompts[2], 'Why did traffic drop for example.com')
  assert.equal(panel.prompts.some((prompt) => prompt.includes('bisibility:')), false)
})

test('a skill click, Ask, and a suggestion each replace the draft', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /startSession\(target, \{ agentPreset: PRESET_ID, prompt, whenDraftExists: 'replace' \}\)/)
  const planted = source.replaceAll("whenDraftExists: 'replace'", "whenDraftExists: 'keep'")
  assert.equal(/whenDraftExists: 'replace'/.test(planted), false)
  assert.match(source, /whenDraftExists: 'replace'/)
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const skill = findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'rank-tracking-report')
  skill.props.onClick()
  await panel.settle()
  assert.equal(panel.drafts.at(-1).whenDraftExists, 'replace')
  assert.match(panel.prompts.at(-1), /^\/rank-tracking-report /)
  const chip = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Preview a first audit')
  chip.props.onClick()
  assert.equal(panel.drafts.at(-1).whenDraftExists, 'replace')
  assert.match(panel.prompts.at(-1), /^\/seo-audit /)
  const input = findNode(panel.tree(), (node) => node.props?.id === 'bis-ask')
  input.props.onChange({ target: { value: 'hello there' } })
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'form' && node.props.className === 'bis-ask').props.onSubmit({
    preventDefault() {},
  })
  assert.equal(panel.drafts.at(-1).whenDraftExists, 'replace')
  assert.equal(panel.prompts.at(-1), 'hello there for example.com')
  assert.equal(panel.drafts.every((draft) => draft && draft.whenDraftExists === 'replace'), true)
})

test('ask suggestions follow audit, Search Console, and traffic history', async () => {
  const rich = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist.audit = true
      body.audit = { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 3, stopReason: 'finished', topIssues: [] }
      body.searchConsole = { ...body.searchConsole, connected: true }
      return body
    },
  })
  const connected = await mountPanel({ fetch: rich.fetchImpl })
  const connectedText = textOf(connected.tree())
  assert.match(connectedText, /Review site issues/)
  assert.match(connectedText, /Show my search queries/)
  assert.match(connectedText, /Compare a competitor/)
  assert.equal(connectedText.includes('Why did my traffic drop?'), false)
  const dropped = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 3, stopReason: 'finished', topIssues: [] }
      body.searchConsole = { ...body.searchConsole, connected: true }
      body.analytics = { connected: true, needsReauth: false, status: 'connected', sessions: [{ date: '2026-10-20', sessions: 12 }], error: null }
      return body
    },
  })
  const history = await mountPanel({ fetch: dropped.fetchImpl })
  const historyText = textOf(history.tree())
  assert.match(historyText, /Why did my traffic drop\?/)
  assert.equal(historyText.includes('Compare a competitor'), false)
})

test('the ask field keeps a single focus ring on its wrapper', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const field = [...source.matchAll(/\.bis-askField\{([^}]*)\}/g)].find((match) => match[1].includes('--bis-ask-control'))
  const ring = cssRule(source, focusSelectors)
  const quiet = source.match(/\.bis-askField input:focus,\.bis-askField input:focus-visible\{([^}]*)\}/)
  assert.ok(field)
  assert.ok(ring)
  assert.ok(quiet)
  assert.match(field[1], /border-radius:var\(--bis-ask-radius\)/)
  assert.match(ring, /outline:2px solid var\(--dsw-focus-ring-color,var\(--dsw-alias-brand-primary\)\)/)
  assert.match(ring, /outline-offset:2px/)
  assert.equal(/inset/.test(ring), false)
  assert.equal(/border:/.test(ring), false)
  assert.match(quiet[1], /outline:none/)
  assert.match(cssRule(source, focusSelectors), /outline:2px solid var\(--dsw-focus-ring-color/)
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const input = findNode(panel.tree(), (node) => node.props?.id === 'bis-ask')
  const wrapper = parentOf(panel.tree(), input)
  assert.equal(wrapper.props.className, 'bis-askField')
  assert.equal(wrapper.props.children.filter((node) => node.type === 'input').length, 1)
})

test('the ask input and its button share one height', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const row = [...source.matchAll(/\.bis-askRow\{([^}]*)\}/g)].find((match) => match[1].includes('--bis-ask-control'))
  const field = [...source.matchAll(/\.bis-askField\{([^}]*)\}/g)].find((match) => match[1].includes('--bis-ask-control'))
  const submit = [...source.matchAll(/\.bis-askSubmit\{([^}]*)\}/g)].find((match) => match[1].includes('--bis-ask-control'))
  assert.ok(row)
  assert.ok(field)
  assert.ok(submit)
  const decl = (block, prop) => {
    const found = block.match(new RegExp(`(?:^|;)${prop}:([^;]+)`))
    return found === null ? null : found[1]
  }
  assert.match(row[1], /align-items:stretch/)
  assert.match(row[1], /--bis-ask-control:var\(--dsw-control-height-md,36px\)/)
  assert.match(row[1], /--bis-ask-radius:var\(--dsw-radius-md,14px\)/)
  assert.equal(decl(field[1], 'height'), 'var(--bis-ask-control)')
  assert.equal(decl(submit[1], 'height'), decl(field[1], 'height'))
  assert.equal(decl(submit[1], 'min-height'), decl(field[1], 'min-height'))
  assert.equal(decl(submit[1], 'max-height'), decl(field[1], 'max-height'))
  assert.equal(decl(submit[1], 'border-radius'), decl(field[1], 'border-radius'))
  const planted = submit[1].replace('var(--bis-ask-control)', '40px')
  assert.notEqual(decl(field[1], 'height'), decl(planted, 'height'))
  assert.equal(decl(field[1], 'height'), decl(submit[1], 'height'))
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const input = findNode(panel.tree(), (node) => node.props?.id === 'bis-ask')
  const fieldNode = parentOf(panel.tree(), input)
  const askRow = parentOf(panel.tree(), fieldNode)
  const button = findNode(askRow, (node) => node.props?.className === 'bis-askSubmit')
  assert.equal(fieldNode.props.className, 'bis-askField')
  assert.equal(askRow.props.className, 'bis-askRow')
  assert.equal(input.props['data-size'], 'md')
  assert.equal(button.props['data-size'], 'md')
  assert.equal(input.props['data-size'], button.props['data-size'])
})

test('start screen outlines use two theme levels', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const light = source.match(/@media \(prefers-color-scheme:light\)\{\.bis-page\{([^}]*)\}/)
  const dark = source.match(/@media \(prefers-color-scheme:dark\)\{\.bis-page\{([^}]*)\}/)
  assert.ok(light)
  assert.ok(dark)
  for (const block of [light[1], dark[1]]) {
    assert.match(block, /--bis-outline-subtle:/)
    assert.match(block, /--bis-outline-strong:/)
    assert.equal(block.includes('none'), false)
    assert.equal(block.includes('#'), false)
    assert.match(block, /var\(--dsw-alias-border-/)
  }
  assert.match(light[1], /--bis-outline-subtle:var\(--dsw-alias-border-l2\)/)
  assert.match(light[1], /--bis-outline-strong:var\(--dsw-alias-border-l1\)/)
  assert.notEqual(
    light[1].match(/--bis-outline-subtle:([^;]+)/)[1],
    light[1].match(/--bis-outline-strong:([^;]+)/)[1],
  )
  const chip = cssRule(source, '.bis-suggest')
  const field = cssRule(source, '.bis-askField')
  const inner = cssRule(source, '.bis-askField .bis-input,.bis-askField input')
  const typed = cssRule(source, '.bis-askField .bis-input>input')
  assert.match(chip, /border:1px solid var\(--bis-outline-subtle\)/)
  assert.equal(chip.includes('border:0'), false)
  assert.equal(chip.includes('none'), false)
  assert.match(field, /border:1px solid var\(--bis-outline-strong\)/)
  assert.match(inner, /border:0/)
  assert.match(inner, /background:transparent/)
  assert.match(inner, /box-shadow:none/)
  assert.equal(/border:1px/.test(inner), false)
  assert.match(typed, /padding:0 12px/)
  assert.match(cssRule(source, focusSelectors), /outline:2px solid var\(--dsw-focus-ring-color/)
  const planted = inner.replace('border:0', 'border:1px solid var(--bis-outline-strong)')
  assert.match(planted, /border:1px solid var\(--bis-outline-strong\)/)
  assert.equal(/border:1px/.test(inner), false)
  const plantedChip = chip.replace('var(--bis-outline-subtle)', 'none')
  assert.equal(/border:1px solid var\(--bis-outline-subtle\)/.test(plantedChip), false)
  assert.match(chip, /border:1px solid var\(--bis-outline-subtle\)/)
  const ask = cssRule(source, '.bis-ask')
  const suggests = cssRule(source, '.bis-suggests')
  assert.match(ask, /gap:10px/)
  assert.match(suggests, /margin:0/)
  assert.equal(/margin-top:\s*-/.test(suggests), false)
  assert.equal(suggests.includes('overflow:hidden'), false)
})

test('the traffic suggestion waits for connected Analytics snapshots', async () => {
  const searchOnly = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 3, stopReason: 'finished', topIssues: [] }
      body.searchConsole = { ...body.searchConsole, connected: true, previous: { clicks: 4, impressions: 20 } }
      body.analytics = { connected: false, needsReauth: false, status: 'not_connected', sessions: [], error: null }
      return body
    },
  })
  const searchText = textOf((await mountPanel({ fetch: searchOnly.fetchImpl })).tree())
  assert.equal(searchText.includes('Why did my traffic drop?'), false)
  assert.match(searchText, /Compare a competitor/)
  const emptyAnalytics = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.analytics = { connected: true, needsReauth: false, status: 'connected', sessions: [], error: null }
      return body
    },
  })
  assert.equal(textOf((await mountPanel({ fetch: emptyAnalytics.fetchImpl })).tree()).includes('Why did my traffic drop?'), false)
  const history = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.analytics = {
        connected: true,
        needsReauth: false,
        status: 'connected',
        sessions: [{ date: '2026-10-20', sessions: 40 }],
        error: null,
      }
      return body
    },
  })
  const historyText = textOf((await mountPanel({ fetch: history.fetchImpl })).tree())
  assert.match(historyText, /Why did my traffic drop\?/)
  assert.equal(historyText.includes('Compare a competitor'), false)
})

test('the audit gate and the weekly step render in English and Chinese', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist = { audit: true, searchConsole: true, analytics: true, keywords: true }
      body.next = { id: 'weekly', skill: 'rank-tracking-report', then: 'competitor-analysis' }
      body.audit = { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 1, stopReason: 'finished', topIssues: [], pages: [] }
      return body
    },
    handle: serveWorkflows(),
  })
  const english = await mountPanel({ fetch: fetchImpl })
  assert.equal(textOf(english.tree()).includes('Site audits are included during the trial'), false)
  await openSkillAudit(english)
  const englishText = textOf(english.tree())
  assert.match(englishText, /Site audits are included during the trial/)
  assert.match(englishText, /Start with a skill/)
  assert.match(englishText, /Search Console not connected · Analytics not connected · Optional/)
  assert.equal(englishText.includes('Finish setup'), false)
  assert.equal(/free audit/i.test(englishText), false)
  const chinese = await mountPanel({ fetch: fetchImpl, language: 'zh-CN' })
  await openSkillAudit(chinese)
  const chineseText = textOf(chinese.tree())
  assert.match(chineseText, /试用期间包含站点审计/)
  assert.match(chineseText, /从一个技能开始/)
  assert.match(chineseText, /未连接 Search Console · 未连接 Analytics · 可选/)
})

test('the featured audit button does not start a second crawl', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { fetchImpl, calls } = panelFetch({
    handle: serveWorkflows((url, init) => {
      if (String(url).includes('/bisibility/audit') && init.method === 'POST') {
        return gate.then(() =>
          Response.json({
            origin: 'https://bisibility.com',
            audit: { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 3 },
          }),
        )
      }
      return undefined
    }),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const button = () => findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit')
  const first = button()
  first.props.onClick()
  first.props.onClick()
  await panel.settle()
  assert.match(textOf(panel.tree()), /Crawling up to 15 pages/)
  assert.equal(button(), null)
  release()
  await panel.settle()
  const posted = calls.filter((call) => call.url.includes('/bisibility/audit') && call.init.method === 'POST')
  assert.equal(posted.length, 1)
})

test('a saved audit error stays on the audit card', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist.audit = true
      body.checklist.searchConsole = true
      body.next = { id: 'keywords', skill: 'project-setup' }
      body.audit = null
      body.auditError = { kind: 'tool', message: 'saved audit unavailable' }
      body.searchConsole = {
        ...body.searchConsole,
        connected: true,
        clicks: 13,
        impressions: 140,
        previous: { clicks: 4, impressions: 20 },
      }
      return body
    },
    handle: serveWorkflows(),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data').props.onClick()
  await panel.settle()
  const searchCard = findNode(panel.tree(), (node) => node.props?.['data-source'] === 'search')
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.role === 'dialog')), /saved audit unavailable/)
  assert.match(textOf(searchCard), /13/)
  assert.match(textOf(searchCard), /Window: 2026-10-01 to 2026-10-28/)
  assert.equal(textOf(panel.tree()).includes('Sign in again'), false)
})

test('the header shows a project switcher only when the account has more than one project', async () => {
  const many = await mountPanel({ fetch: panelFetch().fetchImpl })
  const shown = textOf(many.tree())
  assert.match(shown, /Connected/)
  assert.equal(shown.includes('mcp__bisibility'), false)
  assert.equal(shown.includes('New bisibility conversation'), false)
  assert.equal(shown.includes('What the agent gets'), false)
  assert.equal(shown.includes('It is not a subscription'), false)
  const opener = findNode(many.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Project')
  assert.ok(opener)
  const settings = findNode(many.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Settings')
  settings.props.onClick()
  await many.settle()
  const menu = textOf(many.tree())
  assert.match(menu, /Session token/)
  assert.match(menu, /This is not a subscription/)
  assert.match(menu, /Version 0\.2\.3/)
  assert.match(menu, /Refresh/)
  assert.match(menu, /Disconnect/)

  const one = await mountPanel({
    fetch: panelFetch({
      projects: [{ id: PANEL_PROJECT, name: 'Example', domain: 'example.com' }],
    }).fetchImpl,
  })
  assert.equal(
    findNode(one.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Project'),
    null,
  )
  assert.match(textOf(one.tree()), /example\.com/)
})

test('the settings menu is end-aligned and states the session token once', async () => {
  const sentence = 'Session token renews when you use bisibility. This is not a subscription.'
  const panel = await mountPanel({ fetch: panelFetch().fetchImpl })
  const settings = findNode(panel.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Settings')
  settings.props.onClick()
  await panel.settle()
  const menu = findNode(panel.tree(), (node) => node.props?.role === 'menu')
  assert.equal(menu.props['data-side'], 'bottom')
  assert.equal(menu.props['data-align'], 'end')
  assert.equal(menu.props['data-placement'], 'bottom-end')
  assert.equal(menu.props['data-avoid-collisions'], 'true')
  assert.equal(String(menu.props['data-collision-padding']), '8')
  assert.match(menu.props.className, /bis-settingsMenu/)
  const anchor = findNode(panel.tree(), (node) => node.props?.className === 'bis-settingsAnchor')
  assert.equal(findNode(anchor, (node) => node.props?.role === 'menu'), menu)
  assert.ok(findNode(anchor, (node) => node.type === 'button' && node.props['aria-label'] === 'Settings'))
  const style = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  assert.equal(menu.props['data-portal'], 'true')
  assert.match(style, /\.bis-menuList\{[^}]*max-width:min\(320px,calc\(100vw - 32px\)\)/)
  const note = findNode(menu, (node) => node.props?.className === 'bis-menuNote' && textOf(node) === sentence)
  assert.equal(textOf(note), sentence)
  assert.notEqual(note.props.role, 'menuitem')
  const labels = menu.props.children.filter((child) => child?.props?.role === 'presentation')
  assert.equal(textOf(labels[0]), 'Version 0.2.3')
  assert.equal(textOf(labels[1]), sentence)
  const shown = textOf(panel.tree())
  assert.equal(shown.split(sentence).length - 1, 1)
  assert.equal(shown.includes('This is the session token'), false)
  assert.equal(shown.includes('This the session token'), false)
  const actions = []
  walk(menu, (node) => {
    if (node.props?.role === 'menuitem') actions.push(textOf(node))
  })
  assert.equal(actions.some((label) => label.includes('Session token')), false)
  assert.ok(actions.includes('Refresh'))

  const chinese = await mountPanel({ fetch: panelFetch().fetchImpl, language: 'zh-CN' })
  const zhSentence = '会话令牌会在你使用 bisibility 时续期。这不是订阅。'
  findNode(chinese.tree(), (node) => node.type === 'button' && node.props['aria-label'] === '设置').props.onClick()
  await chinese.settle()
  const zhMenu = findNode(chinese.tree(), (node) => node.props?.role === 'menu')
  assert.equal(zhMenu.props['data-placement'], 'bottom-end')
  assert.equal(zhMenu.props['data-align'], 'end')
  const zhNote = findNode(zhMenu, (node) => node.props?.className === 'bis-menuNote' && textOf(node) === zhSentence)
  assert.equal(textOf(zhNote), zhSentence)
  assert.notEqual(zhNote.props.role, 'menuitem')
  const zhShown = textOf(chinese.tree())
  assert.equal(zhShown.split(zhSentence).length - 1, 1)
  assert.equal(zhShown.includes(sentence), false)
})

test('a broken connection keeps the header and ask row and shows the alert', async () => {
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/oauth/status')) {
        return Response.json({
          connected: true,
          pending: false,
          refreshable: true,
          mcp: 'failed',
          version: '0.2.3',
          error: 'mount failed',
        })
      }
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const tree = panel.tree()
  const broken = findNode(tree, (node) => node.props?.className === 'bis-broken')
  assert.ok(broken)
  assert.match(textOf(broken), /Connected, but the MCP client did not start/)
  const ask = findNode(tree, (node) => node.props?.className === 'bis-ask')
  assert.ok(ask)
  assert.match(textOf(ask), /What would you like to improve\?/)
  const send = findNode(ask, (node) => node.type === 'button' && node.props.className === 'bis-askSubmit')
  assert.equal(send.props.disabled, true)
  assert.equal(textOf(tree).includes('Start audit'), false)
  assert.equal(findNode(tree, (node) => node.type === 'button' && node.props['aria-label'] === 'Project'), null)
  const header = findNode(tree, (node) => node.props?.className === 'bis-head')
  assert.equal(header.props.children[0].props['data-slot'], 'mark')
  assert.equal(header.props.children[1].props['data-slot'], 'titles')
  assert.equal(header.props.children[2].props['data-slot'], 'end')
})

test('skill card actions line up and provider setup stays off the first row', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-skillCard'), /height:100%/)
  assert.match(cssRule(source, '.bis-skillResult'), /flex:1 1 auto/)
  assert.match(cssRule(source, '.bis-skillGrid'), /align-items:stretch/)
  assert.equal(/inset 0 1px 0 rgba\(255,255,255,\.35\)/.test(source), false)
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.checklist.searchConsole = true
      body.searchConsole = { ...body.searchConsole, connected: true }
      return body
    },
    handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const cards = []
  walk(panel.tree(), (node) => {
    if (typeof node.props?.className === 'string' && node.props.className.includes('bis-skillCard')) cards.push(node)
  })
  assert.equal(cards.length, 6)
  for (const card of cards) {
    const kids = card.props.children.filter((child) => child && child.props)
    assert.equal(kids[0].props.className, 'bis-skillTop')
    assert.equal(kids[1].props.className, 'bis-skillTitle')
    assert.equal(kids[2].props.className, 'bis-skillResult')
    const audit = findNode(card, (child) => child.props?.['data-skill'] === 'seo-audit') !== null
    assert.equal(kids[3].props.className, audit ? 'bis-skillAction bis-skillActions' : 'bis-skillAction')
    if (!audit) {
      assert.equal(kids[3].props['data-variant'], 'outline')
      assert.equal(kids[3].type, 'button')
    }
  }
  const first = cards.map((card) => findNode(card, (child) => typeof child.props?.['data-skill'] === 'string').props['data-skill'])
  assert.equal(first.includes('provider-setup'), false)
  const planted = ['provider-setup', ...first]
  assert.equal(planted.includes('provider-setup'), true)
  assert.equal(first.includes('provider-setup'), false)
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'Project').props.onClick()
  await panel.settle()
  const projectSkills = []
  walk(panel.tree(), (node) => {
    if (node.type === 'button' && typeof node.props['data-skill'] === 'string') projectSkills.push(node.props['data-skill'])
  })
  assert.ok(projectSkills.includes('provider-setup'))
  findNode(panel.tree(), (node) => node.type === 'button' && node.props['aria-label'] === 'Settings').props.onClick()
  await panel.settle()
  const provider = findNode(panel.tree(), (node) => node.props?.role === 'menuitem' && textOf(node) === 'Provider setup')
  assert.ok(provider)
  provider.props.onClick()
  await panel.settle()
  const after = []
  walk(panel.tree(), (node) => {
    if (node.type === 'button' && typeof node.props['data-skill'] === 'string') after.push(node.props['data-skill'])
  })
  assert.ok(after.includes('provider-setup'))
})

test('skill cards hide routers and keep technical labels out of the grid', async () => {
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/workflows')) {
        return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      }
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const skills = () => {
    const found = []
    walk(panel.tree(), (node) => {
      if (node.type === 'button' && typeof node.props['data-skill'] === 'string') found.push(node.props['data-skill'])
    })
    return found
  }
  assert.deepEqual(skills(), [
    'seo-audit',
    'keyword-opportunity-research',
    'rank-tracking-report',
    'ai-visibility-audit',
    'competitor-analysis',
    'backlink-profile-analysis',
  ])
  const shown = textOf(panel.tree())
  assert.equal(shown.includes('Next skill'), false)
  assert.equal(shown.includes('Route a task'), false)
  assert.equal(shown.includes('estimate_only'), false)
  assert.equal(shown.includes('Router pack'), false)
  assert.equal(shown.includes('No saved audit'), false)
  assert.match(skillCardText(panel.tree(), 'seo-audit'), /Up to 15 pages/)
  assert.match(shown, /Connect Search Console/)
  const style = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  assert.match(style, /min-width:\s*560px/)
  assert.match(style, /min-width:\s*860px/)
  assert.match(style, /gap:\s*14px/)
  const more = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'All skills')
  more.props.onClick()
  await panel.settle()
  const expanded = skills()
  assert.equal(expanded.includes('seo-coach'), false)
  assert.equal(expanded.includes('bisibility'), false)
  assert.equal(expanded.includes('project-setup'), true)
  assert.ok(expanded.length > 6)
  const tabs = []
  walk(panel.tree(), (node) => {
    if (node.props?.role === 'tab') tabs.push(textOf(node))
  })
  assert.deepEqual(tabs, ['All', 'SEO', 'AI visibility', 'Site health', 'Data & reports', 'Project'])
  assert.equal(tabs.includes('Social'), false)
  const tile = style.match(/\.bis-skillTile\{[^}]*\}/)
  assert.ok(tile)
  const width = Number(tile[0].match(/width:(\d+)px/)[1])
  const height = Number(tile[0].match(/height:(\d+)px/)[1])
  assert.deepEqual([width, height], [48, 48])
  assert.match(tile[0], /border-radius:14px/)
  assert.match(tile[0], /linear-gradient\(135deg,.* 0%,.* 68%,.* 100%\)/)
  assert.match(tile[0], /var\(--dsw-alias-bg-layer-2\)/)
  assert.match(tile[0], /var\(--dsw-alias-label-primary\)/)
  assert.equal(/bis-wave|bis-skillArt|feGaussianBlur|drop-shadow/.test(style), false)
  assert.equal(style.includes('.bis-skillTile::after'), false)
  assert.match(style, /\.bis-error\{[^}]*state-error-primary/)
  assert.equal(/\.bis-skillTile\[data-surface=site-health\]\{[^}]*state-success/.test(style), false)
  assert.equal(style.includes('bis-banner'), false)
  assert.equal(/\.bis-catalog\{[^}]*background-image/.test(style), false)
  assert.equal(/\.bis-h2\{[^}]*background-image/.test(style), false)
  assert.equal(/\.bis-skillCard\{[^}]*background-image/.test(style), false)
  const banners = []
  walk(panel.tree(), (node) => {
    if (typeof node.props?.className === 'string' && node.props.className.includes('bis-banner')) banners.push(node)
  })
  assert.deepEqual(banners, [])
})

test('a finished audit shows only the views its fields can fill', async () => {
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl, calls } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        createdAt: '2026-10-28T12:00:00.000Z',
        pagesCrawled: 2,
        stopReason: 'finished',
        requests: 4,
        state: 'complete',
        summary: { pages: 2, errors: 1 },
        topIssues: [
          {
            severity: 'error',
            code: 'missing_title',
            message: 'Missing title',
            count: 1,
            url: 'https://example.com/',
            urls: ['https://example.com/', 'https://example.com/a'],
          },
        ],
        pages: [
          { url: 'https://example.com/', status: 200, issues: [{ code: 'missing_title', severity: 'error', message: 'Missing title' }] },
          { url: 'https://example.com/a', status: null, issues: [] },
        ],
      }
      return body
    },
    handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  assert.equal(textOf(panel.tree()).includes('Missing title'), false)
  await openSkillAudit(panel)
  const shown = textOf(panel.tree())
  assert.match(shown, /2 pages crawled/)
  assert.match(shown, /Missing title/)
  assert.match(shown, /Completed · .+ · 2 pages crawled/)
  assert.equal(shown.includes('Crawl completed'), false)
  assert.equal(shown.split('Missing title').length - 1, 1)
  const auditCard = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const auditSurfaces = []
  walk(auditCard, (node) => {
    if (typeof node.props?.['data-surface'] === 'string') auditSurfaces.push(node.props['data-surface'])
  })
  assert.deepEqual(auditSurfaces, [])
  assert.equal(shown.includes('Start audit'), false)
  const tabs = () => {
    const labels = []
    walk(panel.tree(), (node) => {
      if (node.props?.role === 'tab') labels.push(textOf(node))
    })
    return labels
  }
  const auditTabs = tabs()
  assert.ok(auditTabs.includes('Findings'))
  assert.ok(auditTabs.includes('Pages'))
  assert.ok(auditTabs.includes('Run details'))
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'Pages').props.onClick()
  await panel.settle()
  const pages = textOf(panel.tree())
  assert.match(pages, /https:\/\/example.com\//)
  assert.match(pages, /https:\/\/example.com\/a/)
  assert.match(pages, /200/)
  assert.equal(pages.includes('blocked'), false)
  assert.equal(pages.includes('critical'), false)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Review with agent').props.onClick()
  const prompt = panel.prompts.at(-1)
  assert.match(prompt, /\/seo-audit Review audit agr_abcdefghijklmnopqrstuvwx for example.com/)
  assert.match(prompt, /Finding: Missing title \(missing_title, error\)/)
  assert.match(prompt, /https:\/\/example.com\/a/)
  const skill = findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')
  skill.props.onClick()
  await panel.settle()
  assert.equal(calls.filter((call) => call.url.includes('/bisibility/audit') && call.init?.method === 'POST').length, 0)

  const sparse = await mountPanel({
    fetch: panelFetch({
      overview(projectId) {
        const body = disconnectedOverview(projectId)
        body.audit = { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 3, topIssues: [], pages: [], summary: {} }
        return body
      },
      handle: serveWorkflows(),
    }).fetchImpl,
  })
  await openSkillAudit(sparse)
  const sparseTabs = []
  walk(sparse.tree(), (node) => {
    if (node.props?.role === 'tab') sparseTabs.push(textOf(node))
  })
  assert.equal(sparseTabs.includes('Findings'), false)
  assert.equal(sparseTabs.includes('Pages'), false)
  assert.equal(sparseTabs.includes('Run details'), false)
  assert.match(textOf(sparse.tree()), /3 pages crawled/)
})

test('the first paint reserves the start screen', async () => {
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/projects')) return new Promise(() => {})
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const cards = []
  walk(panel.tree(), (node) => {
    if (typeof node.props?.className === 'string' && node.props.className.includes('bis-skeletonCard')) cards.push(node)
  })
  assert.equal(cards.length, 6)
  const grid = findNode(panel.tree(), (node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-skillGrid'))
  assert.ok(grid)
  const row = findNode(panel.tree(), (node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-connections'))
  assert.ok(row)
  const shown = textOf(panel.tree())
  assert.equal(shown.includes('Finish setup'), false)
  const checklist = findNode(panel.tree(), (node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-checklist'))
  assert.equal(checklist, null)
})

test('connections that have not loaded do not claim Search Console is disconnected', async () => {
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/overview') || url.includes('/bisibility/connections')) return new Promise(() => {})
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  assert.equal(shown.includes('Search Console not connected'), false)
  assert.equal(shown.includes('No saved audit'), false)
  assert.equal(shown.includes('Connect Search Console'), false)
  const row = findNode(panel.tree(), (node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-connections'))
  assert.equal(row.props.role, 'status')
})

test('a failed overview shows its error while independent connections remain visible', async () => {
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/overview')) {
        return new Response(JSON.stringify({ error: { message: 'overview exploded' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  const failure = findNode(panel.tree(), (node) => node.props?.className === 'bis-failure')
  const planted = {
    props: {
      className: 'bis-failure',
      children: [
        { props: { className: 'bis-failureText', children: ['overview exploded'] } },
        { type: 'button', props: { children: ['Retry'] } },
      ],
    },
  }
  assert.throws(() => assertFailureBlock(planted, 'overview exploded'), /raw tool text/)
  assertFailureBlock(failure, 'overview exploded')
  assert.equal(shown.includes('Search Console not connected'), true)
  assert.equal(shown.includes('No saved audit'), false)
})

test('the site audit card opens one modal and a run waits for an explicit confirm', async () => {
  const posted = (calls) => calls.filter((call) => call.url.includes('/bisibility/audit') && call.init?.method === 'POST')
  const dialog = (panel) => findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const { fetchImpl, calls } = panelFetch({ handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  const card = findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')
  assert.equal(textOf(card), 'Run audit')
  assert.equal(textOf(card) === 'Preview first audit', false)
  findNode(panel.tree(), (node) => node.props?.id === 'bis-ask').props.onChange({ target: { value: 'keep this' } })
  await panel.settle()
  const before = panel.prompts.length
  card.props.onClick()
  await panel.settle()
  assert.equal(posted(calls).length, 0)
  assert.equal(panel.prompts.length, before)
  assert.match(textOf(dialog(panel)), /Up to 15 pages/)
  const run = findNode(dialog(panel), (node) => node.type === 'button' && textOf(node) === 'Start audit')
  assert.ok(run)
  panel.press('Escape')
  await panel.settle()
  assert.equal(dialog(panel), null)
  assert.equal(findNode(panel.tree(), (node) => node.props?.id === 'bis-ask').props.value, 'keep this')
  await openSkillAudit(panel)
  findNode(dialog(panel), (node) => node.props?.['aria-label'] === 'Close').props.onClick()
  await panel.settle()
  assert.equal(dialog(panel), null)
  assert.equal(findNode(panel.tree(), (node) => node.props?.id === 'bis-ask').props.value, 'keep this')
  await openSkillAudit(panel)
  findNode(dialog(panel), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  assert.equal(posted(calls).length, 1)

  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const runningFetch = panelFetch({
    handle: serveWorkflows((url, init) => {
      if (String(url).includes('/bisibility/audit') && init?.method === 'POST') {
        return pending.then(() => Response.json({ origin: 'https://bisibility.com', audit: { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 4, stopReason: 'finished', topIssues: [] } }))
      }
      return undefined
    }),
  })
  const running = await mountPanel({ fetch: runningFetch.fetchImpl })
  await openSkillAudit(running)
  findNode(dialog(running), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await running.settle()
  findNode(dialog(running), (node) => node.props?.['aria-label'] === 'Close').props.onClick()
  await running.settle()
  assert.equal(dialog(running), null)
  assert.equal(textOf(findNode(running.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')), 'View progress')
  release()
  await running.settle()
  assert.equal(dialog(running), null)
  assert.equal(textOf(findNode(running.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')), 'Run audit')

  const savedFetch = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        createdAt: '2026-11-03T12:00:00.000Z',
        pagesCrawled: 1,
        stopReason: 'finished',
        topIssues: [{ severity: 'error', code: 'missing_title', message: 'Missing title', count: 1, url: 'https://example.com/a', urls: ['https://example.com/a'] }],
        pages: [{ url: 'https://example.com/a', status: 200, issues: [] }],
      }
      return body
    },
    handle: serveWorkflows((url) => {
      if (String(url).includes('/bisibility/recent')) {
        return Response.json({
          origin: 'https://bisibility.com',
          audits: [
            {
              id: 'agr_olderolderolderolderolder',
              createdAt: '2026-10-01T00:00:00.000Z',
              pagesCrawled: 2,
              status: 'finished',
              topIssues: [{ severity: 'info', code: 'old', message: 'Old finding', urls: ['https://example.com/old'] }],
              pages: [{ url: 'https://example.com/old', status: 200 }],
            },
          ],
          reports: [],
        })
      }
      return undefined
    }),
  })
  const saved = await mountPanel({ fetch: savedFetch.fetchImpl })
  assert.equal(textOf(findNode(saved.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')), 'Run audit')
  assert.equal(dialog(saved), null)
  await openSkillAudit(saved)
  assert.equal(saved.prompts.length, 0)
  assert.equal(posted(savedFetch.calls).length, 0)
  const findings = findNode(dialog(saved), (node) => node.props?.role === 'tab' && textOf(node) === 'Findings')
  assert.equal(findings.props['aria-selected'], 'true')
  findNode(dialog(saved), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick()
  await saved.settle()
  findNode(dialog(saved), (node) => node.type === 'button' && node.props?.['data-audit-history'] === 'agr_olderolderolderolderolder').props.onClick()
  await saved.settle()
  assert.match(textOf(dialog(saved)), /Old finding/)
  const again = findNode(dialog(saved), (node) => node.type === 'button' && textOf(node) === 'Run again')
  assert.equal(again.props['data-variant'], 'outline')
  again.props.onClick()
  await saved.settle()
  assert.equal(posted(savedFetch.calls).length, 0)
  assert.match(textOf(dialog(saved)), /Up to 15 pages/)
  findNode(dialog(saved), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await saved.settle()
  assert.equal(posted(savedFetch.calls).length, 1)
})

test('the project tab returns to all when the account has no project', async () => {
  const workflows = shapeWorkflows('example.com', 'en')
  const { fetchImpl } = panelFetch({
    projects: [],
    handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const skills = () => {
    const found = []
    walk(panel.tree(), (node) => {
      if (node.type === 'button' && typeof node.props['data-skill'] === 'string') found.push(node.props['data-skill'])
    })
    return found
  }
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'Project').props.onClick()
  await panel.settle()
  assert.ok(skills().includes('project-setup'))
  assert.equal(skills().includes('seo-coach'), false)
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'All').props.onClick()
  await panel.settle()
  const back = skills()
  assert.ok(back.includes('seo-audit'))
  assert.equal(back.includes('project-setup'), false)
})

test('a Chinese review prefill names the finding and the URLs in Chinese', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        pagesCrawled: 1,
        topIssues: [
          {
            severity: 'error',
            code: 'missing_title',
            message: 'Missing title',
            count: 1,
            url: 'https://example.com/a',
            urls: ['https://example.com/a'],
          },
        ],
      }
      return body
    },
    handle: serveWorkflows(),
  })
  const panel = await mountPanel({ fetch: fetchImpl, language: 'zh-CN' })
  await openSkillAudit(panel)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === '交给智能体查看').props.onClick()
  const prompt = panel.prompts.at(-1)
  assert.equal(prompt.includes('Finding:'), false)
  assert.equal(prompt.includes('Affected URLs:'), false)
  assert.match(prompt, /发现：Missing title（missing_title，error）/)
  assert.match(prompt, /受影响的网址：/)
  assert.match(prompt, /https:\/\/example.com\/a/)
  assert.match(prompt, /agr_abcdefghijklmnopqrstuvwx/)
  assert.match(prompt, /example\.com/)
})

function modalPart(type, props, children = []) {
  return { type, props: { ...props, children } }
}

function shellDialog({ bodyChildren = [], footer = null, meta = null, headerInBody = false } = {}) {
  const header = modalPart('div', { className: 'bis-modalHeader' }, [
    modalPart('h2', { className: 'bis-modalTitle' }, ['Site audit · example.com']),
    modalPart('button', { type: 'button', 'aria-label': 'Close' }, ['×']),
  ])
  const body = modalPart('div', { className: 'bis-modalBody' }, headerInBody ? [header, ...bodyChildren] : bodyChildren)
  const kids = []
  if (!headerInBody) kids.push(header)
  if (meta) kids.push(meta)
  kids.push(body)
  if (footer) kids.push(footer)
  return modalPart('div', { role: 'dialog' }, kids)
}

function assertModalChrome(dialog) {
  if (dialog?.props?.role !== 'dialog') throw new Error('missing dialog')
  const titles = []
  const closes = []
  walk(dialog, (node) => {
    if (node.type === 'h2') titles.push(node)
    if (node.type === 'button' && (node.props?.['aria-label'] === 'Close' || node.props?.['aria-label'] === '关闭')) closes.push(node)
  })
  if (titles.length > 1) throw new Error('second title')
  if (closes.length > 1) throw new Error('second close')
  if (titles.length !== 1) throw new Error('modal title count')
  if (closes.length !== 1) throw new Error('modal close count')
  const header = findNode(dialog, (node) => node.props?.className === 'bis-modalHeader')
  const body = findNode(dialog, (node) => node.props?.className === 'bis-modalBody')
  const footer = findNode(dialog, (node) => node.props?.className === 'bis-modalFooter')
  if (!header || !body) throw new Error('modal shell missing')
  if (findNode(body, (node) => node === header)) throw new Error('header scrolls')
  if (footer && findNode(body, (node) => node === footer)) throw new Error('footer scrolls')
  walk(body, (node) => {
    const className = typeof node.props?.className === 'string' ? node.props.className : ''
    if (className.includes('bis-card') || className.includes('bis-auditCard')) throw new Error('nested card')
    if (node.type === 'h2') throw new Error('second title')
    if (node.type === 'button' && (node.props?.['aria-label'] === 'Close' || node.props?.['aria-label'] === '关闭')) throw new Error('second close')
  })
  const gate = findNode(dialog, (node) => node.props?.className === 'bis-auditGate')
  if (gate) {
    if (findNode(body, (node) => node === gate)) throw new Error('trial line in body')
    if (!footer || findNode(footer, (node) => node === gate) === null) throw new Error('trial line not in footer')
  }
  const meta = findNode(dialog, (node) => node.props?.className === 'bis-modalMeta')
  if (meta) {
    const text = textOf(meta)
    if (text.includes('Finished') || text.includes('Crawl completed')) throw new Error('metadata repeats status')
    if (!(/Completed · .+ · \d+ pages crawled/.test(text) || /已完成 · .+ · 已抓取/.test(text))) throw new Error('metadata form')
    if (findNode(body, (node) => node === meta)) throw new Error('metadata in body')
    if (textOf(dialog).split(text).length - 1 !== 1) throw new Error('metadata repeated')
  }
}

function cssBlock(source, selector) {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))
  if (!match) throw new Error(`missing ${selector}`)
  return match[1]
}

function modalShellCss(source) {
  const shell = cssBlock(source, '.bis-modal.bis-modal')
  if (!/width:min\(880px,100%\)/.test(shell) || !/max-width:880px/.test(shell)) throw new Error('modal width')
  if (!/border-radius:16px/.test(shell)) throw new Error('modal radius')
  if (!/margin-inline:auto/.test(shell)) throw new Error('modal not centered')
  const meta = cssBlock(source, '.bis-modalMeta,.bis-modal>div:first-child>p')
  if (!/margin:8px 0 0/.test(meta) || !/padding:0 24px/.test(meta)) throw new Error('title to metadata')
  const body = cssBlock(source, '.bis-modalBody,.bis-modal>div:first-child>div:last-child')
  if (!/margin-top:20px/.test(body) || !/padding:4px 24px/.test(body)) throw new Error('header to tabs')
  if (!/overflow:auto/.test(body)) throw new Error('body does not scroll')
  if (!/padding:4px 24px 16px/.test(body)) throw new Error('modal padding')
  const close = cssBlock(source, '.bis-modalHeader>button,.bis-modal [class*="_close_"]')
  if (!/min-width:32px/.test(close) || !/min-height:32px/.test(close)) throw new Error('close target')
  if (!/gap:12px/.test(cssBlock(source, '.bis-auditActions'))) throw new Error('button gap')
  if (!/gap:12px/.test(cssBlock(source, '.bis-finding'))) throw new Error('finding gap')
  if (!/gap:8px/.test(cssBlock(source, '.bis-findingUrls'))) throw new Error('url gap')
  if (!/gap:24px/.test(cssBlock(source, '.bis-auditPane'))) throw new Error('tabs to content')
  const header = cssBlock(source, '.bis-modalHeader,.bis-modal>div:first-child>div:first-child')
  if (!/padding:16px 24px 0/.test(header)) throw new Error('shared left edge')
  const narrow = source.match(/@container \(max-width:640px\)\{([\s\S]*?)\n\}/)
  if (!narrow || !/padding:0 16px/.test(narrow[1]) || /\.bis-modal\.bis-modal\{[^}]*border-radius:0/.test(narrow[1])) throw new Error('narrow modal')
  if (source.includes('bis-auditCard') || source.includes('bis-auditHead')) throw new Error('nested card')
  const indicator = cssBlock(source, '.bis-auditTabList .bis-tabIndicator')
  if (!/background:transparent/.test(indicator)) throw new Error('heavy tab')
  return shell
}

function declarations(ruleText) {
  const map = new Map()
  for (const part of ruleText.split(';')) {
    const index = part.indexOf(':')
    if (index === -1) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function lengthPx(token) {
  if (token === '0') return 0
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(token)
  if (!match) throw new Error('length ' + token)
  return Number(match[1])
}

function expandSides(value) {
  const parts = value.split(/\s+/).map(lengthPx)
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] }
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
}

function edgeOffset(ruleText) {
  const props = declarations(ruleText)
  const padding = expandSides(props.get('padding') || '0')
  const margin = expandSides(props.get('margin') || '0')
  const padStart = props.has('padding-inline-start') ? lengthPx(props.get('padding-inline-start')) : padding.left
  const marginStart = props.has('margin-inline-start') ? lengthPx(props.get('margin-inline-start')) : margin.left
  return padStart + marginStart
}

function assertOpticalGhost(toggleRule, hoverRule, statusEdge) {
  const props = declarations(toggleRule)
  const padding = expandSides(props.get('padding') || '0')
  if (padding.top === 0 || padding.left === 0) throw new Error('zero padding')
  if (padding.top !== padding.bottom || padding.left !== padding.right) throw new Error('symmetric padding')
  if (padding.top < 4 || padding.top > 6 || padding.left < 8 || padding.left > 10) throw new Error('ghost padding')
  if (props.get('gap') !== '6px') throw new Error('chevron gap')
  const column = edgeOffset(toggleRule)
  if (column !== statusEdge) throw new Error('label edge')
  const hover = declarations(hoverRule)
  if (hover.get('padding') !== props.get('padding') || hover.get('margin-inline-start') !== props.get('margin-inline-start')) {
    throw new Error('hover moves')
  }
}

function parentOf(tree, node) {
  let parent = null
  walk(tree, (item) => {
    if (parent === null && Array.isArray(item.props?.children) && item.props.children.includes(node)) parent = item
  })
  return parent
}

function finishedAudit(projectId) {
  const body = disconnectedOverview(projectId)
  body.audit = {
    id: 'agr_abcdefghijklmnopqrstuvwx',
    createdAt: '2026-10-28T12:00:00.000Z',
    pagesCrawled: 5,
    stopReason: 'finished',
    topIssues: [
      {
        severity: 'info',
        code: 'robots',
        message: 'Robots directives disallow indexing.',
        count: 3,
        unit: 'URLs',
        urls: [
          'https://supatable.co/privacy',
          'https://supatable.co/terms',
          'https://supatable.co/subprocessors',
          'https://supatable.co/security',
        ],
      },
      {
        severity: 'error',
        code: 'missing_title',
        message: 'Missing title',
        count: 2,
        urls: ['https://example.com/a'],
      },
    ],
    pages: [{ url: 'https://supatable.co/privacy', status: 200, issues: [] }],
    summary: { pages: 5 },
  }
  return body
}

test('a finished audit header names the domain, date, and pages once', async () => {
  const { fetchImpl } = panelFetch({ overview: finishedAudit, handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const card = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assertModalChrome(card)
  const shown = textOf(card)
  assert.equal(shown.split('Site audit · example.com').length - 1, 1)
  assert.equal(shown.split('5 pages crawled').length - 1, 1)
  assert.equal(shown.split('Robots directives disallow indexing.').length - 1, 1)
  assert.match(shown, /Completed · .+ · 5 pages crawled/)
  assert.equal(shown.includes('Crawl completed'), false)
  assert.equal(shown.includes('Finished'), false)
  assert.equal(shown.includes('Last audit'), false)
  assert.equal(shown.includes('(info)'), false)
  const title = findNode(card, (node) => node.type === 'h2' && textOf(node) === 'Site audit · example.com')
  assert.equal(title.props.className, 'bis-modalTitle')
  const pagesButton = findNode(card, (node) => node.type === 'button' && textOf(node) === '5 pages crawled')
  assert.equal(pagesButton, null)
})

test('audit and results modals keep a single header outside the scrolling body', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.throws(
    () => modalShellCss(source.replace('.bis-modalMeta,.bis-modal>div:first-child>p{margin:8px 0 0', '.bis-modalMeta,.bis-modal>div:first-child>p{margin:2px 0 0')),
    /title to metadata/,
  )
  assert.throws(
    () => modalShellCss(source.replace('.bis-modal.bis-modal{', '.bis-auditCard{padding:16px}.bis-modal.bis-modal{')),
    /nested card/,
  )
  modalShellCss(source)
  assert.throws(() => assertModalChrome(shellDialog({ bodyChildren: [modalPart('h2', {}, ['Inner'])] })), /second title/)
  assert.throws(
    () => assertModalChrome(shellDialog({ bodyChildren: [modalPart('button', { 'aria-label': 'Close' }, ['×'])] })),
    /second close/,
  )
  assert.throws(
    () => assertModalChrome(shellDialog({ bodyChildren: [modalPart('section', { className: 'bis-card bis-auditCard' }, [])] })),
    /nested card/,
  )
  assert.throws(() => assertModalChrome(shellDialog({ headerInBody: true })), /header scrolls/)
  const gate = modalPart('p', { className: 'bis-auditGate' }, ['trial'])
  assert.throws(() => assertModalChrome(shellDialog({ bodyChildren: [gate] })), /trial line in body/)
  const repeated = 'Crawl completed · Nov 3, 2026 · Finished · 5 pages crawled'
  assert.throws(
    () => assertModalChrome(shellDialog({ meta: modalPart('p', { className: 'bis-modalMeta' }, [repeated]) })),
    /metadata repeats status/,
  )
  const line = 'Completed · Nov 3, 2026 · 5 pages crawled'
  assert.throws(
    () =>
      assertModalChrome(
        shellDialog({
          meta: modalPart('p', { className: 'bis-modalMeta' }, [line]),
          bodyChildren: [line],
        }),
      ),
    /metadata repeated/,
  )
})

test('Run again is a button on the same row as the other audit actions', async () => {
  const { fetchImpl } = panelFetch({ overview: finishedAudit, handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const card = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const again = findNode(card, (node) => node.type === 'button' && textOf(node) === 'Run again')
  assert.equal(again.props['data-variant'], 'outline')
  const row = parentOf(card, again)
  assert.equal(row.props.className, 'bis-auditActions')
  assert.equal(parentOf(card, row).props.className, 'bis-modalFooter')
  const review = findNode(card, (node) => node.type === 'button' && textOf(node) === 'Review with agent')
  assert.equal(review.props['data-variant'], 'primary')
  assert.equal(parentOf(card, review), row)
  const view = findNode(card, (node) => node.type === 'button' && textOf(node) === 'View findings')
  assert.equal(view, null)
  const gate = findNode(card, (node) => node.props?.className === 'bis-auditGate')
  assert.match(textOf(gate), /After the trial, paid access is required/)
  assert.equal(parentOf(card, gate).props.className, 'bis-auditActions')
  const body = findNode(card, (node) => node.props?.className === 'bis-modalBody')
  assert.equal(findNode(body, (node) => node === gate), null)
  findNode(card, (node) => node.props?.role === 'tab' && textOf(node) === 'Pages').props.onClick()
  await panel.settle()
  const shown = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'View findings')
  assert.equal(shown.props['data-variant'], 'outline')
  assert.equal(parentOf(panel.tree(), shown).props.className, 'bis-auditActions')
})

function tabContainerCss(source) {
  const rule = source.match(/\.bis-tabs\{([^}]*)\}/)
  if (!rule) throw new Error('missing tab container')
  const body = rule[1]
  if (/(^|;)width:\d/.test(body) || /(^|;)width:100%/.test(body)) throw new Error('tab container has a fixed width')
  if (!/width:fit-content/.test(body)) throw new Error('tab container is not fit-content')
  if (!/flex-wrap:nowrap/.test(body)) throw new Error('tabs wrap')
  if (!/overflow-x:auto/.test(body)) throw new Error('narrow tabs do not scroll')
  return body
}

test('skill category tabs hug their labels and the indicator sits on the selected tab', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const broken = source.replace('width:fit-content', 'width:240px')
  assert.throws(() => tabContainerCss(broken), /fixed width/)
  tabContainerCss(source)
  const { fetchImpl } = panelFetch({ handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  const tablist = findNode(panel.tree(), (node) => node.props?.role === 'tablist' && node.props?.['aria-label'] === 'Skill categories')
  assert.match(tablist.props.className, /bis-tabs/)
  const tabs = tablist.props.children.filter((node) => node.props?.role === 'tab')
  assert.deepEqual(tabs.map((node) => textOf(node)), ['All', 'SEO', 'AI visibility', 'Site health', 'Data & reports', 'Project'])
  for (const tab of tabs) assert.equal(parentOf(panel.tree(), tab), tablist)
  const selected = () => tabsOf(panel).find((node) => node.props['aria-selected'] === 'true')
  assert.equal(textOf(selected()), 'All')
  assert.equal(findNode(selected(), (node) => node.props?.className === 'bis-tabIndicator').props['aria-hidden'], 'true')
  for (const tab of tabsOf(panel)) {
    if (tab.props['aria-selected'] === 'true') continue
    assert.equal(findNode(tab, (node) => node.props?.className === 'bis-tabIndicator'), null)
  }
  tabsOf(panel).find((node) => textOf(node) === 'Site health').props.onClick()
  await panel.settle()
  assert.equal(textOf(selected()), 'Site health')
  assert.ok(findNode(selected(), (node) => node.props?.className === 'bis-tabIndicator'))
  assert.equal(findNode(tabsOf(panel).find((node) => textOf(node) === 'All'), (node) => node.props?.className === 'bis-tabIndicator'), null)
})

function tabsOf(panel) {
  const tablist = findNode(panel.tree(), (node) => node.props?.role === 'tablist' && node.props?.['aria-label'] === 'Skill categories')
  return tablist.props.children.filter((node) => node.props?.role === 'tab')
}

test('audit view tabs stay compact and do not stretch', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const tabs = source.match(/\.bis-auditTabs\{([^}]*)\}/)
  assert.ok(tabs)
  assert.match(tabs[1], /margin:0/)
  assert.equal(/(^|;)width:\d/.test(tabs[1]), false)
  tabContainerCss(source)
  modalShellCss(source)
  const { fetchImpl } = panelFetch({ overview: finishedAudit, handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const tablist = findNode(panel.tree(), (node) => node.props?.role === 'tablist' && node.props?.['aria-label'] === 'Site audit')
  assert.match(tablist.props.className, /bis-tabs/)
  assert.match(tablist.props.className, /bis-auditTabList/)
  const labels = tablist.props.children.map((node) => textOf(node))
  assert.deepEqual(labels, ['Findings', 'Pages', 'Run details', 'History'])
  for (const tab of tablist.props.children) assert.equal(parentOf(panel.tree(), tab), tablist)
  const selected = tablist.props.children.find((node) => node.props['aria-selected'] === 'true')
  assert.equal(textOf(selected), 'Findings')
  assert.ok(findNode(selected, (node) => node.props?.className === 'bis-tabIndicator'))
})

test('a finding row shows a severity tag, the real unit, and one link per URL', async () => {
  const { fetchImpl } = panelFetch({ overview: finishedAudit, handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const card = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const row = findNode(card, (node) => node.props?.className === 'bis-finding' && textOf(node).includes('Robots directives disallow indexing.'))
  const tags = []
  const links = []
  walk(row, (node) => {
    if (node.props?.['data-primitive'] === 'Tag') tags.push(textOf(node))
    if (node.type === 'a') links.push(node)
  })
  assert.deepEqual(tags, ['info'])
  assert.equal(textOf(row).includes('(info)'), false)
  const count = findNode(row, (node) => node.props?.className === 'bis-findingCount')
  assert.equal(textOf(count), '3 URLs')
  assert.equal(links.length, 3)
  assert.deepEqual(
    links.map((link) => link.props.href),
    ['https://supatable.co/privacy', 'https://supatable.co/terms', 'https://supatable.co/subprocessors'],
  )
  for (const link of links) assert.equal(link.props.title, undefined)
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\.bis-findingUrl\{[^}]*text-overflow:ellipsis/)
  assert.match(source, /\.bis-findingUrl\{[^}]*white-space:nowrap/)
  const more = findNode(row, (node) => node.type === 'button' && textOf(node) === 'Show 1 more')
  more.props.onClick()
  await panel.settle()
  const opened = findNode(panel.tree(), (node) => node.props?.className === 'bis-finding' && textOf(node).includes('Robots directives disallow indexing.'))
  const openedLinks = []
  walk(opened, (node) => {
    if (node.type === 'a') openedLinks.push(node.props.href)
  })
  assert.deepEqual(openedLinks, [
    'https://supatable.co/privacy',
    'https://supatable.co/terms',
    'https://supatable.co/subprocessors',
    'https://supatable.co/security',
  ])
  const plain = findNode(card, (node) => node.props?.className === 'bis-finding' && textOf(node).includes('Missing title'))
  const plainCount = findNode(plain, (node) => node.props?.className === 'bis-findingCount')
  assert.equal(plainCount, null)
})

test('findings list the affected URLs', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        pagesCrawled: 1,
        topIssues: [
          {
            severity: 'error',
            code: 'missing_title',
            message: 'Missing title',
            count: 1,
            url: 'https://example.com/a',
            urls: ['https://example.com/a'],
          },
        ],
        pages: [{ url: 'https://example.com/a', status: null, issues: [] }],
      }
      return body
    },
    handle: serveWorkflows(),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openSkillAudit(panel)
  const findings = findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'Findings')
  assert.equal(findings.props['aria-selected'], 'true')
  const shown = textOf(panel.tree())
  assert.match(shown, /Missing title/)
  assert.equal(shown.includes('(error)'), false)
  const link = findNode(panel.tree(), (node) => node.type === 'a' && node.props?.href === 'https://example.com/a')
  assert.ok(link)
})

test('project data shows its chevron while closed and lines up with the status line', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const rule = (selector) => {
    const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))
    assert.ok(match, selector)
    return match[1]
  }
  const toggleRule = rule('.bis-projectDataToggle')
  const hoverRule = rule('.bis-projectDataToggle:hover,.bis-projectDataToggle:focus,.bis-projectDataToggle:focus-visible')
  const labelRule = rule('.bis-projectDataLabel')
  const chevronRule = rule('.bis-projectDataChevron')
  const openRule = rule('.bis-projectDataChevron[data-open=true]')
  const statusEdge = edgeOffset(rule('.bis-connections')) + edgeOffset(rule('.bis-connections p')) - edgeOffset(rule('.bis-projectData'))
  assert.throws(() => assertOpticalGhost(toggleRule.replace('padding:6px 8px', 'padding:0'), hoverRule, statusEdge), /zero padding/)
  assertOpticalGhost(toggleRule, hoverRule, statusEdge)
  assert.match(labelRule, /padding:0/)
  assert.match(labelRule, /margin:0/)
  assert.match(chevronRule, /color:var\(--dsw-alias-label-tertiary\)/)
  assert.match(chevronRule, /transform:rotate\(-90deg\)/)
  assert.equal(/opacity:0/.test(chevronRule), false)
  assert.match(openRule, /transform:rotate\(0deg\)/)
  assert.equal(/bis-projectDataChevron[^{]*:hover/.test(source), false)
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const growth = findNode(panel.tree(), (node) => node.props?.className === 'bis-growth')
  const status = findNode(growth, (node) => node.props?.className === 'bis-connections' && textOf(node).includes('Search Console'))
  const toggle = findNode(growth, (node) => node.type === 'button' && textOf(node) === 'Project data')
  assert.equal(toggle.props['data-variant'], 'ghost')
  assert.equal(toggle.props['aria-expanded'], 'false')
  assert.equal(toggle.props['aria-controls'], 'bis-project-data')
  const chevron = findNode(toggle, (node) => node.type === 'svg' && node.props?.['data-phosphor'] === 'CaretDown')
  assert.ok(chevron)
  const label = toggle.props.children[0]
  const statusLine = status.props.children.find((node) => node.type === 'p')
  assert.equal(textOf(label), 'Project data')
  assert.equal(label.props.className, 'bis-projectDataLabel')
  assert.equal(parentOf(growth, status).props.className, 'bis-growth')
  assert.equal(parentOf(growth, parentOf(growth, toggle)).props.className, 'bis-growth')
  assert.equal(status.props.children[0], statusLine)
  toggle.props.onClick()
  await panel.settle()
  const opened = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data')
  assert.equal(opened.props['aria-expanded'], 'true')
  const turned = findNode(opened, (node) => node.props?.className === 'bis-projectDataChevron')
  assert.equal(turned.props['data-open'], 'true')
  const panelNode = findNode(panel.tree(), (node) => node.props?.id === 'bis-project-data')
  assert.ok(panelNode)
})

test('indexing is not dated with the clicks window', async () => {
  const { fetchImpl } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.searchConsole = {
        ...body.searchConsole,
        connected: true,
        clicks: 13,
        impressions: 140,
        indexing: { notIndexed: 12, urls: ['https://example.com/a'] },
      }
      body.analytics = {
        connected: true,
        needsReauth: false,
        status: 'connected',
        sessions: [{ date: '2026-10-20', sessions: 40 }],
        error: null,
      }
      return body
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data').props.onClick()
  await panel.settle()
  const card = findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')
  const shown = textOf(card)
  assert.match(shown, /Window: 2026-10-01 to 2026-10-28/)
  assert.match(shown, /not indexed in the not_indexed group/)
  assert.equal(shown.includes('12 not indexed in the not_indexed group, 2026-10-01 to 2026-10-28'), false)
  assert.match(shown, /40 on 2026-10-20/)
  assert.equal(shown.includes('Keyword page sessions, 2026-10-01 to 2026-10-28'), false)
})

test('a failed catalog shows the error instead of the loading skeleton', async () => {
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/workflows')) {
        return new Response(JSON.stringify({ error: { message: 'catalog exploded' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  const failure = findNode(panel.tree(), (node) => node.props?.className === 'bis-failure')
  assertFailureBlock(failure, 'catalog exploded', 'Skills could not load.')
  const skeleton = findNode(
    panel.tree(),
    (node) => node.props?.className === 'bis-catalog' && node.props?.role === 'status',
  )
  assert.equal(skeleton, null)
})

test('data report cards use their own source and action', async () => {
  const overview = (id) => {
    const body = disconnectedOverview(id)
    body.checklist = { audit: true, searchConsole: true, analytics: false, keywords: false }
    body.searchConsole = { ...body.searchConsole, connected: true }
    return body
  }
  const { fetchImpl } = panelFetch({ overview, handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Data & reports').props.onClick()
  await panel.settle()
  const queries = skillCardText(panel.tree(), 'keyword-opportunity-research')
  const alerts = skillCardText(panel.tree(), 'alert-triage')
  const weekly = skillCardText(panel.tree(), 'weekly-report')
  assert.throws(() => assertDataCards(queries.replace('Search Console', 'Estimate first'), alerts), /estimate label/)
  assert.throws(() => assertDataCards(queries, alerts.replace('Review alerts', 'Review changes')), /review changes/)
  assert.throws(() => assertDataCards(queries, alerts.replace('No alerts yet', 'Add keywords')), /keywords label/)
  assertDataCards(queries, alerts)
  assert.match(weekly, /Add keywords/)
  assert.match(weekly, /Review changes/)
})

test('every visible skill has a phosphor icon and a path', async () => {
  const expected = {
    'rank-tracking-report': 'Ranking',
    'keyword-clustering': 'Tag',
    'keyword-import': 'UploadSimple',
    'competitor-analysis': 'UsersThree',
    'competitive-landscape': 'MapTrifold',
    'backlink-profile-analysis': 'Link',
    'local-seo': 'MapPin',
    'ai-visibility-audit': 'Eye',
    'ai-prompt-research': 'MagnifyingGlass',
    'seo-audit': 'Scan',
    'keyword-opportunity-research': 'ChartLineUp',
    'weekly-report': 'FileText',
    'alert-triage': 'Siren',
    'project-setup': 'GearSix',
    'domain-onboarding': 'Globe',
    'provider-setup': 'PuzzlePiece',
    'team-api-governance': 'Key',
  }
  const workflows = shapeWorkflows('example.com', 'en')
  const visible = workflows.filter((row) => row.router !== true)
  assert.equal(visible.length, Object.keys(expected).length)
  for (const row of visible) assert.equal(typeof expected[row.skill], 'string', row.skill)
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const groups = Object.fromEntries([...source.matchAll(/(?:'([^']+)'|(\w+)): \{ icon: '(\w+)', base: '(#[0-9A-F]{6})', dark: '(#[0-9A-F]{6})', light: '(#[0-9A-F]{6})' \}/g)]
    .map((match) => [match[1] || match[2], { icon: match[3], base: match[4], dark: match[5], light: match[6] }]))
  assert.equal(Object.keys(groups).length, 6)
  for (const row of visible) assert.ok(Object.hasOwn(groups, row.surface), `unmapped surface: ${row.surface}`)
  const pathFor = (name) => {
    const match = source.match(new RegExp(`${name}: '([^']+)'`))
    assert.ok(match, name)
    assert.equal(match[1].length > 20, true, name)
    return match[1]
  }
  for (const name of [...Object.values(expected), ...Object.values(groups).map((group) => group.icon)]) pathFor(name)
  for (const name of ['ShareNetwork', 'Binoculars', 'CaretDown', 'DotsThree', 'MagnifyingGlass']) pathFor(name)
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'All skills').props.onClick()
  await panel.settle()
  const style = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  for (const [id, group] of Object.entries(groups)) {
    const rule = style.match(new RegExp(`\\.bis-skillTile\\[data-surface=${id}\\]\\{[^}]+\\}`))
    assert.ok(rule, `missing group style: ${id}`)
    for (const stop of ['dark', 'base', 'light']) assert.ok(rule[0].includes(`--bis-group-${stop}:${group[stop]}`), `${id} ${stop}`)
  }
  const found = new Map()
  walk(panel.tree(), (node) => {
    if (typeof node.props?.className !== 'string' || !node.props.className.includes('bis-skillCard')) return
    const action = findNode(node, (child) => typeof child.props?.['data-skill'] === 'string')
    const paths = []
    const names = []
    walk(node, (child) => {
      if (child.type === 'path' && typeof child.props?.d === 'string') paths.push(child.props.d)
      if (child.type === 'svg' && typeof child.props?.['data-phosphor'] === 'string') names.push(child.props['data-phosphor'])
    })
    const tile = findNode(node, (child) => child.props?.className === 'bis-skillTile')
    assert.equal(tile.props['aria-hidden'], 'true')
    assert.equal(findNode(node, (child) => child.props?.className === 'bis-skillArt'), null)
    found.set(action.props['data-skill'], { names, paths, surface: tile.props['data-surface'] })
  })
  assert.equal(found.size, visible.length)
  for (const row of visible) {
    const icon = found.get(row.skill)
    assert.equal(icon.surface, row.surface, row.skill)
    assert.deepEqual(icon.names, [expected[row.skill]], row.skill)
    assert.deepEqual(icon.paths, [pathFor(expected[row.skill])], row.skill)
  }
  const glyphs = []
  walk(panel.tree(), (node) => {
    if (node.type === 'svg' && typeof node.props?.['data-phosphor'] === 'string') glyphs.push(node.props['data-phosphor'])
  })
  assert.equal(glyphs.includes('CaretDown'), true)
  assert.equal(glyphs.includes('DotsThree'), true)
  assert.equal(glyphs.filter((name) => name === 'MagnifyingGlass').length >= 2, true)
  assert.equal(glyphs.some((name) => name.startsWith('Icon')), false)
  const notice = readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8')
  assert.match(notice, /Copyright \(c\) 2020 Phosphor Icons/)
  assert.match(notice, /MIT License/)
  assert.match(notice, /@phosphor-icons\/react[`']? 2\.1\.10/)
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.files.includes('THIRD_PARTY_NOTICES.md'), true)
})

function suggestGroup(tree) {
  return findNode(tree, (node) => node.props?.role === 'group' && node.props?.['aria-label'] === 'What would you like to improve?')
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\{([^}]*)\\}`))
  assert.ok(match, selector)
  return match[1]
}

test('suggestion placeholders match the chip row', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const row = cssRule(source, '.bis-suggests')
  const chip = cssRule(source, '.bis-suggest')
  const bone = cssRule(source, '.bis-suggestSkeleton')
  assert.match(row, /display:flex/)
  assert.match(row, /flex-wrap:wrap/)
  assert.match(row, /align-items:center/)
  assert.match(row, /gap:8px/)
  assert.match(chip, /height:28px/)
  assert.match(chip, /line-height:18px/)
  assert.match(chip, /border:1px solid var\(--bis-outline-subtle\)/)
  assert.match(bone, /border:0/)
  assert.match(bone, /background:var\(--dsw-alias-bg-layer-2\)/)
  assert.match(source, /@keyframes bis-shimmer/)
  assert.match(bone, /bis-shimmer/)
  const widths = [...source.matchAll(/\.bis-suggestSkeleton:nth-child\(\d\)\{width:(\d+)px\}/g)].map((match) => Number(match[1]))
  assert.deepEqual(widths, [156, 148, 132])
  for (const width of widths) assert.equal(width >= 120 && width <= 170, true)
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/overview') || url.includes('/bisibility/connections')) return new Promise(() => {})
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const group = suggestGroup(panel.tree())
  const bones = group.props.children.filter((node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-suggestSkeleton'))
  assert.equal(bones.length, 3)
  for (const node of bones) {
    assert.equal(node.type, 'span')
    assert.equal(node.props.className.includes('bis-suggest'), true)
    assert.equal(node.props.className.includes('bis-pill'), false)
    assert.equal(node.props.className.includes('bis-skeleton'), false)
    assert.equal(node.props['aria-hidden'], 'true')
  }
  assert.equal(textOf(group).includes('Preview a first audit'), false)
})

test('loaded suggestions replace the skeleton', async () => {
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const group = suggestGroup(panel.tree())
  const bones = group.props.children.filter((node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-suggestSkeleton'))
  assert.equal(bones.length, 0)
  const chips = group.props.children.filter((node) => node.type === 'button')
  assert.equal(chips.length, 3)
  for (const chip of chips) {
    assert.match(chip.props.className, /bis-suggest/)
    assert.equal(chip.props.className.includes('bis-suggestSkeleton'), false)
  }
  assert.match(textOf(group), /Preview a first audit/)
  assert.match(textOf(group), /Compare a competitor/)
  assert.match(textOf(group), /Review mentions/)
})

test('a failed overview shows the default suggestions', async () => {
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/overview')) {
        return new Response(JSON.stringify({ error: { message: 'overview exploded' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        })
      }
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  const failure = findNode(panel.tree(), (node) => node.props?.className === 'bis-failure')
  assertFailureBlock(failure, 'overview exploded')
  const group = suggestGroup(panel.tree())
  const bones = group.props.children.filter((node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-suggestSkeleton'))
  assert.equal(bones.length, 0)
  assert.match(textOf(group), /Preview a first audit/)
  assert.match(textOf(group), /Compare a competitor/)
  assert.match(textOf(group), /Review mentions/)
})

test('an empty overview shows the default suggestions', async () => {
  const { fetchImpl } = panelFetch({
    handle(url) {
      if (url.includes('/bisibility/overview')) return Response.json(null)
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const shown = textOf(panel.tree())
  assert.equal(shown.includes('overview exploded'), false)
  const group = suggestGroup(panel.tree())
  const bones = group.props.children.filter((node) => typeof node.props?.className === 'string' && node.props.className.includes('bis-suggestSkeleton'))
  assert.equal(bones.length, 0)
  assert.match(textOf(group), /Preview a first audit/)
  assert.match(textOf(group), /Compare a competitor/)
  assert.match(textOf(group), /Review mentions/)
})

test('recent results stay hidden when empty and a finished audit leaves a toast', async () => {
  const empty = await mountPanel({ fetch: panelFetch().fetchImpl })
  assert.equal(textOf(empty.tree()).includes('Recent results'), false)
  const planted = ['Recent results']
  assert.equal(planted.includes('Recent results'), true)
  assert.equal(textOf(empty.tree()).includes('Recent results'), false)

  const { fetchImpl } = panelFetch({
    handle: serveWorkflows((url, init) => {
      if (String(url).includes('/bisibility/recent')) {
        return Response.json({
          origin: 'https://bisibility.com',
          audits: [{ id: 'agr_abcdefghijklmnopqrstuvwx', title: 'Crawl', createdAt: '2026-11-03T12:00:00.000Z', pagesCrawled: 5, status: 'finished' }],
          reports: [{ id: 'agr_bbbbbbbbbbbbbbbbbbbbbbbb', title: 'Note', createdAt: '2026-11-02T12:00:00.000Z', status: 'saved', prompt: '/seo-audit note' }],
        })
      }
      if (String(url).includes('/bisibility/audit') && init?.method === 'POST') {
        return Response.json({
          origin: 'https://bisibility.com',
          audit: { id: 'agr_abcdefghijklmnopqrstuvwx', pagesCrawled: 4, stopReason: 'finished', topIssues: [] },
        })
      }
      return undefined
    }),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  assert.match(textOf(panel.tree()), /Recent results/)
  assert.match(textOf(panel.tree()), /Site audit/)
  assert.match(textOf(panel.tree()), /5 pages crawled/)
  const recent = findNode(panel.tree(), (node) => node.props?.className === 'bis-recent')
  assert.equal(findNode(recent, (node) => node.type === 'button' && textOf(node) === 'All results'), null)
  assert.equal(findNode(recent, (node) => node.type === 'button' && textOf(node) === 'Open'), null)
  const viewAll = findNode(recent, (node) => node.type === 'button' && textOf(node) === 'View all →')
  assert.ok(viewAll)
  viewAll.props.onClick()
  await panel.settle()
  const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assertModalChrome(dialog)
  const row = findNode(dialog, (node) => String(node.props?.className).startsWith('bis-recentItem') && textOf(node).includes('Note'))
  assert.equal(findNode(findNode(dialog, (node) => node.props?.className === 'bis-modalBody'), (node) => node.type === 'h2'), null)
  assert.equal(findNode(row, (node) => node.props?.className === 'bis-recentOpen').props['data-variant'], 'ghost')
  assert.match(textOf(dialog), /Note/)
  assert.match(textOf(dialog), /saved/)
  findNode(dialog, (node) => node.props?.['aria-label'] === 'Close').props.onClick()
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.role === 'dialog'), null)
  await openAuditPreparation(panel)
  findNode(findNode(panel.tree(), (node) => node.props?.role === 'dialog'), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  assert.match(textOf(panel.tree()), /Audit ready\. Saved in Results\./)
  const notice = findNode(panel.tree(), (node) => node.props?.['data-primitive'] === 'Toast')
  assert.equal(typeof notice.props.onDone, 'function', 'native Toast completion callback')
  assert.ok(findNode(notice, (node) => node.type === 'button' && textOf(node) === 'Close'))
  notice.props.onDone()
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.['data-primitive'] === 'Toast'), null)
  await openAuditPreparation(panel)
  findNode(findNode(panel.tree(), (node) => node.props?.role === 'dialog'), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Open report').props.onClick()
  await panel.settle()
  assert.equal(textOf(panel.tree()).includes('Audit ready. Saved in Results.'), false)
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.role === 'dialog')), /Results/)
})

test('the start screen order is header, Ask, recent results, then skills', async () => {
  const { fetchImpl } = panelFetch({
    handle: serveWorkflows((url) => {
      if (String(url).includes('/bisibility/recent')) {
        return Response.json({
          origin: 'https://bisibility.com',
          audits: [{ id: 'agr_abcdefghijklmnopqrstuvwx', title: 'Crawl', createdAt: '2026-11-03T12:00:00.000Z', pagesCrawled: 5, status: 'finished' }],
          reports: [],
        })
      }
      return undefined
    }),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const screen = findNode(panel.tree(), (node) => node.props?.className === 'bis-screen')
  const screenNames = screen.props.children.map((child) => (typeof child?.props?.className === 'string' ? child.props.className : ''))
  assert.equal(screenNames[0], 'bis-head')
  const growth = screen.props.children.find((child) => child?.props?.className === 'bis-growth')
  const names = growth.props.children.map((child) => (typeof child?.props?.className === 'string' ? child.props.className : ''))
  const ask = names.findIndex((name) => name.includes('bis-ask'))
  const recent = names.findIndex((name) => name.includes('bis-recent'))
  const skills = names.findIndex((name) => name.includes('bis-catalog'))
  assert.equal(ask, 0)
  assert.ok(recent > ask && skills > recent)
  const planted = names.slice()
  planted[ask] = names[skills]
  planted[skills] = names[ask]
  assert.equal(planted.findIndex((name) => name.includes('bis-catalog')) < planted.findIndex((name) => name.includes('bis-ask')), true)
  assert.equal(names.findIndex((name) => name.includes('bis-catalog')) > names.findIndex((name) => name.includes('bis-ask')), true)
})

test('panel padding follows the panel width', async () => {
  const { fetchImpl } = panelFetch()
  const panel = await mountPanel({ fetch: fetchImpl })
  const style = findNode(panel.tree(), (node) => node.type === 'style')
  const css = textOf(style)
  assert.match(css, /container-type:\s*inline-size/)
  assert.match(css, /4cqw/)
  assert.equal(css.includes('@media (max-width:400px)'), false)
})


/**
 * Rebuild a rendered tree, letting `change` replace each node after its children are rebuilt.
 * Planted violations are made this way so they run through the real assertion.
 */
function rebuild(node, change) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  const children = (node.props?.children ?? []).map((child) => rebuild(child, change))
  return change({ ...node, props: { ...node.props, children } })
}

function auditCard(tree) {
  return findNode(tree, (node) => node.props?.className === 'bis-skillCard' && findNode(node, (child) => child.props?.['data-skill'] === 'seo-audit') !== null)
}

function assertAuditCard(tree, expectedActions) {
  const card = auditCard(tree)
  if (card === null) throw new Error('missing audit card')
  if (textOf(findNode(card, (node) => node.props?.className === 'bis-skillTitle')) !== 'Site audit') throw new Error('title')
  if (textOf(findNode(card, (node) => node.props?.className === 'bis-skillResult')) !== 'Check your site for technical SEO issues.') throw new Error('description')
  const labels = textOf(findNode(card, (node) => node.props?.className === 'bis-skillLabels'))
  if (labels !== 'Up to 15 pages') throw new Error('badge ' + labels)
  const buttons = []
  walk(findNode(card, (node) => String(node.props?.className).includes('bis-skillActions')), (node) => {
    if (node.type === 'button') buttons.push(`${node.props['data-variant']}:${textOf(node)}`)
  })
  if (buttons.join('|') !== expectedActions.join('|')) throw new Error('actions ' + buttons.join('|'))
}

test('the site audit card offers Run audit, and View latest only when a saved audit exists', async () => {
  const savedAudit = {
    id: 'agr_abcdefghijklmnopqrstuvwx',
    createdAt: '2026-11-03T12:00:00.000Z',
    pagesCrawled: 5,
    stopReason: 'finished',
    topIssues: [{ severity: 'error', code: 'missing_title', message: 'Missing title', count: 1, urls: ['https://example.com/a'] }],
  }
  const none = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  assertAuditCard(none.tree(), ['primary:Run audit'])
  const saved = await mountPanel({
    fetch: panelFetch({
      overview(projectId) {
        const body = disconnectedOverview(projectId)
        body.audit = savedAudit
        return body
      },
      handle: serveWorkflows(),
    }).fetchImpl,
  })
  assertAuditCard(saved.tree(), ['primary:Run audit', 'outline:View latest'])
  assert.throws(() => assertAuditCard(none.tree(), ['primary:Run audit', 'outline:View latest']), /actions/)
  assert.throws(() => assertAuditCard(saved.tree(), ['primary:Run audit']), /actions/)
  assert.equal(textOf(auditCard(saved.tree())).includes('Saved results'), false)

  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const olderRun = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = savedAudit
      return body
    },
    handle: serveWorkflows((url, init) => {
      if (String(url).includes('/bisibility/audit') && init?.method === 'POST') return pending.then(() => Response.json({ origin: 'https://bisibility.com', audit: { ...savedAudit, id: 'agr_newnewnewnewnewnewnewnew' } }))
      return undefined
    }),
  })
  const running = await mountPanel({ fetch: olderRun.fetchImpl })
  findNode(running.tree(), (node) => node.props?.['data-audit'] === 'latest').props.onClick()
  await running.settle()
  findNode(running.tree(), (node) => node.type === 'button' && textOf(node) === 'Run again').props.onClick()
  await running.settle()
  findNode(running.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await running.settle()
  findNode(running.tree(), (node) => node.props?.['aria-label'] === 'Close').props.onClick()
  await running.settle()
  assertAuditCard(running.tree(), ['primary:View progress', 'outline:View latest'])
  release()
  await running.settle()
})

test('Run audit opens a preparation step and nothing runs before Start', async () => {
  const assertPreparation = (dialog) => {
    const text = textOf(dialog)
    for (const part of ['Domain', 'example.com', 'Scope', 'Up to 15 pages', 'Access', 'Site audits are included during the trial']) {
      if (!text.includes(part)) throw new Error('preparation misses ' + part)
    }
    if (findNode(dialog, (node) => node.type === 'button' && textOf(node) === 'Start audit') === null) throw new Error('Start audit')
    if (text.includes('Crawling')) throw new Error('already running')
  }
  const { fetchImpl, calls } = panelFetch({ handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fetchImpl })
  await openAuditPreparation(panel)
  const dialog = () => findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assertPreparation(dialog())
  assertModalChrome(dialog())
  const posted = () => calls.filter((call) => call.url.includes('/bisibility/audit') && call.init?.method === 'POST').length
  assert.equal(posted(), 0)
  const withoutStart = rebuild(dialog(), (node) => (node.type === 'button' && textOf(node) === 'Start audit' ? { ...node, type: 'span' } : node))
  assert.throws(() => assertPreparation(withoutStart), /Start audit/)
  const withoutScope = rebuild(dialog(), (node) => (node.props?.className === 'bis-prepValue' && textOf(node) === 'Up to 15 pages' ? { ...node, props: { ...node.props, children: [] } } : node))
  assert.throws(() => assertPreparation(withoutScope), /Up to 15 pages/)
  findNode(dialog(), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  assert.equal(posted(), 1)
})

test('audit preparation and post-trial denial explain paid access in both locales', async () => {
  for (const [language, copy, denied, billing, start] of [
    ['en', 'Site audits are included during the trial. After the trial, paid access is required to run a new audit. Saved audits remain readable.', 'Paid access is required to run a new site audit after the trial.', 'View plans and billing', 'Start audit'],
    ['zh-CN', '试用期间包含站点审计。试用结束后，需要付费访问权限才能运行新的审计。已保存的审计仍可阅读。', '试用结束后，需要付费访问权限才能运行新的站点审计。', '查看套餐和账单', '开始审计'],
  ]) {
    const { fetchImpl, calls } = panelFetch({ handle: serveWorkflows((url, init) => {
      if (url === '/bisibility/audit' && init.method === 'POST') {
        return Response.json({ error: { kind: 'tool', status: 403, message: 'This operation is unavailable for this project.' } }, { status: 403 })
      }
    }) })
    const panel = await mountPanel({ fetch: fetchImpl, language })
    await openAuditPreparation(panel)
    const dialog = () => findNode(panel.tree(), (node) => node.props?.role === 'dialog')
    const assertAccess = (tree) => {
      assert.ok(textOf(tree).includes(copy))
      const link = findNode(tree, (node) => node.type === 'a' && textOf(node) === billing)
      assert.equal(link?.props.href, `https://bisibility.com/app/${PANEL_PROJECT}/settings/billing`)
      assert.equal(link.props.target, '_blank')
      assert.equal(link.props.rel, 'noopener noreferrer')
    }
    assertAccess(dialog())
    assert.equal(calls.filter((call) => call.url === '/bisibility/audit').length, 0)
    findNode(dialog(), (node) => node.type === 'button' && textOf(node) === start).props.onClick()
    await panel.settle()
    const block = findNode(dialog(), (node) => node.props?.role === 'alert')
    assert.ok(block, 'post-trial denial must render an access block even without a saved audit')
    assert.ok(textOf(block).includes(denied))
    assertAccess(block)
    assert.equal(textOf(dialog()).includes('This operation is unavailable for this project.'), false)
  }
})

test('other audit failures do not claim paid access is required', async () => {
  for (const [status, message] of [[403, 'Project permission denied.'], [502, 'This operation is unavailable for this project.']]) {
    const { fetchImpl } = panelFetch({ handle: serveWorkflows((url, init) => {
      if (url === '/bisibility/audit' && init.method === 'POST') return Response.json({ error: { status, message } }, { status })
    }) })
    const panel = await mountPanel({ fetch: fetchImpl })
    await openAuditPreparation(panel)
    findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
    await panel.settle()
    assert.equal(findNode(panel.tree(), (node) => node.props?.role === 'alert'), null)
    assert.ok(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-error')).includes(message))
  }
})

test('View latest opens the saved report, and Run again stays a shortcut inside it', async () => {
  const { fetchImpl, calls } = panelFetch({
    overview(projectId) {
      const body = disconnectedOverview(projectId)
      body.audit = {
        id: 'agr_abcdefghijklmnopqrstuvwx',
        createdAt: '2026-11-03T12:00:00.000Z',
        pagesCrawled: 5,
        stopReason: 'finished',
        topIssues: [{ severity: 'error', code: 'missing_title', message: 'Missing title', count: 1, urls: ['https://example.com/a'] }],
      }
      return body
    },
    handle: serveWorkflows(),
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.props?.['data-audit'] === 'latest').props.onClick()
  await panel.settle()
  const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assert.match(textOf(dialog), /Missing title/)
  assert.equal(textOf(dialog).includes('Start audit'), false)
  assert.ok(findNode(dialog, (node) => node.type === 'button' && textOf(node) === 'Run again'))
  assert.equal(calls.filter((call) => call.init?.method === 'POST').length, 0)
})

function recentAudit(index, createdAt) {
  return { id: `agr_run${index}${'x'.repeat(20)}`, title: 'Site audit', createdAt, prompt: '/seo-audit saved run' }
}

function recentFetch(audits, reports = []) {
  const requestedIds = []
  const base = panelFetch({
    handle: serveWorkflows((url) => {
      if (String(url).includes('/bisibility/recent')) return Response.json({ origin: 'https://bisibility.com', audits, reports })
      if (String(url).includes('/bisibility/audit?')) {
        const id = new URL(url, 'http://localhost').searchParams.get('id')
        requestedIds.push(id)
        const index = audits.findIndex((row) => row.id === id) + 1
        if (index === 0) return Response.json({ error: 'unknown audit' }, { status: 404 })
        return Response.json({ audit: { ...audits[index - 1], pagesCrawled: index + 3, stopReason: 'finished', topIssues: [{ message: `Finding of run ${index}`, urls: [`https://example.com/run${index}`] }] } })
      }
      return undefined
    }),
  })
  return { ...base, requestedIds }
}

function assertRecent(tree, expected) {
  const section = findNode(tree, (node) => node.props?.className === 'bis-recent')
  if (section === null) throw new Error('missing recent section')
  const head = findNode(section, (node) => node.props?.className === 'bis-recentHead')
  if (textOf(findNode(head, (node) => node.type === 'h2')) !== 'Recent results') throw new Error('heading')
  if (findNode(head, (node) => node.type === 'button' && textOf(node) === 'View all →') === null) throw new Error('View all in the header row')
  if (findNode(section, (node) => node.type === 'button' && ['All results', 'Open'].includes(textOf(node))) !== null) throw new Error('separate button')
  const rows = []
  walk(section, (node) => {
    if (String(node.props?.className).startsWith('bis-recentItem')) rows.push(node)
  })
  if (rows.length > 3) throw new Error('more than three rows')
  const metas = rows.map((row) => {
    const open = findNode(row, (node) => node.props?.className === 'bis-recentOpen')
    if (open === null || open.type !== 'button') throw new Error('the whole row is not one click target')
    if (findNode(open, (node) => node.props?.['data-phosphor'] === 'CaretDown') === null) throw new Error('arrow')
    return textOf(findNode(open, (node) => node.props?.className === 'bis-recentMeta'))
  })
  if (metas.length !== expected.length) throw new Error('row count ' + metas.length)
  metas.forEach((meta, i) => {
    if (!expected[i].test(meta)) throw new Error('meta ' + meta)
  })
}

test('recent results are a compact list of three rows that each open their own run', async () => {
  const audits = [
    recentAudit(1, '2026-11-03T15:30:00.000Z', 5),
    recentAudit(2, '2026-11-03T09:10:00.000Z', 7),
    recentAudit(3, '2026-10-20T12:00:00.000Z', 3),
    recentAudit(4, '2026-10-01T12:00:00.000Z', 2),
  ]
  const fixture = recentFetch(audits)
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  const colliding = /^\w+ \d+, \d{4}, .*\d:\d{2}.*$/
  const plain = /^[^,]*, \d{4}$/
  assertRecent(panel.tree(), [colliding, colliding, plain])
  assert.throws(() => assertRecent(panel.tree(), [plain, colliding, plain]), /meta/)
  const fourth = rebuild(panel.tree(), (node) =>
    node.props?.className === 'bis-recentList' ? { ...node, props: { ...node.props, children: [...node.props.children, node.props.children[0]] } } : node,
  )
  assert.throws(() => assertRecent(fourth, [colliding, colliding, plain]), /more than three/)
  const noArrow = rebuild(panel.tree(), (node) => (node.props?.className === 'bis-recentArrow' ? { ...node, props: { ...node.props, children: [] } } : node))
  assert.throws(() => assertRecent(noArrow, [colliding, colliding, plain]), /arrow/)
  const apartHeader = rebuild(panel.tree(), (node) =>
    node.props?.className === 'bis-recentHead' ? { ...node, props: { ...node.props, children: node.props.children.filter((child) => child.type === 'h2') } } : node,
  )
  assert.throws(() => assertRecent(apartHeader, [colliding, colliding, plain]), /View all/)
  const second = findNode(panel.tree(), (node) => node.props?.['data-recent-open'] === audits[1].id)
  second.props.onClick()
  await panel.settle()
  const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assert.deepEqual(fixture.requestedIds, [audits[1].id])
  assert.match(textOf(dialog), /Finding of run 2/)
  assert.equal(textOf(dialog).includes('Finding of run 1'), false)
  const viewAll = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'View all →')
  viewAll.props.onClick()
  await panel.settle()
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.role === 'dialog')), /Results/)
})

test('recent rows show a time only when dates collide, and the section is hidden when empty', async () => {
  const apart = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-11-03T15:30:00.000Z', 5), recentAudit(2, '2026-10-20T12:00:00.000Z', 3)]).fetchImpl })
  const plain = /^[^,]*, \d{4}$/
  assertRecent(apart.tree(), [plain, plain])
  const empty = await mountPanel({ fetch: recentFetch([]).fetchImpl })
  assert.equal(findNode(empty.tree(), (node) => node.props?.className === 'bis-recent'), null)
  assert.throws(() => assertRecent(empty.tree(), []), /missing recent section/)
})

function assertCatalogHead(tree) {
  const catalog = findNode(tree, (node) => node.props?.className === 'bis-catalog' || String(node.props?.className) === 'bis-catalog')
  const head = findNode(catalog, (node) => node.props?.className === 'bis-catalogHead')
  if (head === null) throw new Error('missing catalog head')
  if (textOf(findNode(head, (node) => node.type === 'h2')) !== 'Start with a skill') throw new Error('heading')
  if (findNode(head, (node) => node.props?.id === 'bis-workflow-search') === null) throw new Error('search outside the heading row')
  const tabs = findNode(catalog, (node) => node.props?.role === 'tablist')
  const children = catalog.props.children
  if (children.indexOf(head) !== 0) throw new Error('head is not first')
  if (findNode(children[1], (node) => node === tabs) === null) throw new Error('tabs are not directly under the head')
}

test('the catalog heading and search share one row, and the search drops under the heading on a narrow panel', async () => {
  const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  assertCatalogHead(panel.tree())
  const apart = rebuild(panel.tree(), (node) =>
    node.props?.className === 'bis-catalogHead' ? { ...node, props: { ...node.props, children: node.props.children.filter((child) => child.type === 'h2') } } : node,
  )
  assert.throws(() => assertCatalogHead(apart), /search outside/)
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  assert.match(cssRule(css, '.bis-catalogHead'), /display:flex[^}]*justify-content:space-between|justify-content:space-between[^}]*display:flex/)
  assert.match(cssRule(css, '.bis-catalogSearch'), /flex:0 0 220px/)
  assert.match(css, /@container \(max-width:480px\)\{\.bis-catalogHead\{flex-direction:column/)
  assert.equal(css.replace('@container (max-width:480px){.bis-catalogHead{flex-direction:column', '').includes('.bis-catalogHead{flex-direction:column'), false)
  assert.match(cssRule(css, '.bis-skillGrid'), /margin-top:4px/)
  const loading = await mountPanel({ fetch: () => new Promise(() => {}) })
  const skeleton = findNode(loading.tree(), (node) => node.props?.className === 'bis-catalog')
  assert.ok(findNode(skeleton, (node) => node.props?.className === 'bis-catalogHead'))
})

function providerPanelFetch(statuses) {
  const providers = Object.entries(statuses).map(([id, status]) => ({ id, status }))
  return panelFetch({
    overview: (projectId) => ({ ...disconnectedOverview(projectId), providers }),
    handle: serveWorkflows(),
  }).fetchImpl
}

function providerTrigger(tree) {
  return findNode(tree, (node) => node.type === 'button' && node.props?.className === 'bis-providerTrigger')
}

function providerInput(tree, id) {
  const option = findNode(tree, (node) => node.props?.['data-provider'] === id)
  return option && findNode(option, (node) => node.type === 'input' && node.props?.type === 'checkbox')
}

async function openProviderMenu(panel) {
  const trigger = providerTrigger(panel.tree())
  assert.ok(trigger, 'provider dropdown trigger is missing')
  if (trigger.props['aria-expanded'] !== 'true') {
    trigger.props.onClick()
    await panel.settle()
  }
  assert.ok(findNode(panel.tree(), (node) => node.props?.role === 'menu' && String(node.props.className).includes('bis-providerMenuList')))
}

async function toggleProvider(panel, id) {
  const input = providerInput(panel.tree(), id)
  assert.ok(input, `missing provider checkbox ${id}`)
  input.props.onChange({ target: { checked: !input.props.checked } })
  await panel.settle()
}

test('provider dropdown has compact localized labels and retains menu selection until All clears it', async () => {
  for (const [language, labels] of [['en-US', ['Providers: All', 'Providers: DataForSEO', 'Providers: 2']], ['zh-CN', ['提供方：全部', '提供方：DataForSEO', '提供方：2']]]) {
    const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'needs_reauth', serpapi: 'not_connected' }), language })
    assert.equal(textOf(providerTrigger(panel.tree())), labels[0])
    assert.equal(providerTrigger(panel.tree()).props['aria-expanded'], 'false')
    await openProviderMenu(panel)
    assert.equal(providerInput(panel.tree(), 'all').props.checked, true)
    for (const id of ['dataforseo', 'gsc', 'serpapi']) assert.equal(providerInput(panel.tree(), id).props.checked, false)
    await toggleProvider(panel, 'dataforseo')
    assert.equal(textOf(providerTrigger(panel.tree())), labels[1])
    assert.equal(providerTrigger(panel.tree()).props['aria-expanded'], 'true', 'toggling must keep the menu open')
    assert.equal(providerInput(panel.tree(), 'dataforseo').props.checked, true)
    assert.equal(providerInput(panel.tree(), 'all').props.checked, false)
    await toggleProvider(panel, 'gsc')
    assert.equal(textOf(providerTrigger(panel.tree())), labels[2])
    assert.equal(providerInput(panel.tree(), 'dataforseo').props.checked, true)
    assert.equal(providerInput(panel.tree(), 'gsc').props.checked, true)
    await toggleProvider(panel, 'all')
    assert.equal(textOf(providerTrigger(panel.tree())), labels[0])
    assert.equal(providerInput(panel.tree(), 'all').props.checked, true)
    assert.equal(providerInput(panel.tree(), 'dataforseo').props.checked, false)
    assert.equal(providerInput(panel.tree(), 'gsc').props.checked, false)
    assert.equal(providerTrigger(panel.tree()).props['aria-expanded'], 'true')
  }
})

test('provider dropdown uses native checkbox options, connection labels, and a bounded DSH menu', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'needs_reauth', serpapi: 'not_connected' }) })
  await openProviderMenu(panel)
  const menu = findNode(panel.tree(), (node) => node.props?.role === 'menu' && String(node.props.className).includes('bis-providerMenuList'))
  assert.equal(menu.props['data-align'], 'end')
  assert.equal(menu.props['data-portal'], 'true')
  const ids = []
  walk(menu, (node) => { if (node.props?.className === 'bis-providerOption') ids.push(node.props['data-provider']) })
  assert.deepEqual(ids, ['all', 'dataforseo', 'gsc', 'serpapi'])
  assert.deepEqual(['all', 'dataforseo', 'gsc', 'serpapi'].map((id) => Boolean(providerInput(panel.tree(), id))), [true, true, true, true])
  for (const id of ['all', 'dataforseo', 'gsc', 'serpapi']) {
    const option = findNode(menu, (node) => node.props?.['data-provider'] === id)
    assert.ok(findNode(option, (node) => node.props?.['data-primitive'] === 'Checkbox'), `${id} must use DSH Checkbox`)
  }
  assert.match(textOf(findNode(menu, (node) => node.props?.['data-provider'] === 'gsc')), /Needs reauth/)
  assert.match(textOf(findNode(menu, (node) => node.props?.['data-provider'] === 'serpapi')), /Not connected/)
  assert.ok(findNode(findNode(menu, (node) => node.props?.['data-provider'] === 'gsc'), (node) => node.props?.className === 'bis-dot'))
  assert.ok(findNode(providerTrigger(panel.tree()), (node) => node.props?.['data-phosphor'] === 'CaretDown'))
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-providerChips'), null)
})

test('provider checkbox keyboard handler moves focus and activates with Enter', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({}) })
  await openProviderMenu(panel)
  const list = findNode(panel.tree(), (node) => node.props?.className === 'bis-providerOptions')
  assert.equal(typeof list.props.onKeyDown, 'function')
  let focused = -1
  let clicked = 0
  const inputs = Array.from({ length: 4 }, (_, i) => ({ focus() { focused = i }, click() { clicked += 1 } }))
  const dispatch = (key, index) => {
    let prevented = false
    list.props.onKeyDown({ key, target: inputs[index], currentTarget: { querySelectorAll: () => inputs }, preventDefault: () => { prevented = true } })
    assert.equal(prevented, true, key)
  }
  dispatch('ArrowDown', 0); assert.equal(focused, 1)
  dispatch('ArrowUp', 0); assert.equal(focused, 3)
  dispatch('Home', 2); assert.equal(focused, 0)
  dispatch('End', 0); assert.equal(focused, 3)
  dispatch('Enter', 2); assert.equal(clicked, 1)
})

test('native DSH provider menu supports focus, keyboard selection, and dismissal', tooltipDOMOptions, () => {
  assertNativeProviderMenu()
})

function shownSkills(tree) {
  const found = []
  walk(tree, (node) => {
    if (node.type === 'button' && typeof node.props?.['data-skill'] === 'string') found.push(node.props['data-skill'])
  })
  return found
}

function assertNoResultsInHeader(tree) {
  const header = findNode(tree, (node) => node.props?.className === 'bis-head')
  if (header === null) throw new Error('missing header')
  if (findNode(header, (node) => node.type === 'button' && textOf(node) === 'Results') !== null) throw new Error('results in header')
  if (findNode(header, (node) => node.props?.className === 'bis-resultsSlot') !== null) throw new Error('results slot')
}

function assertHeaderEnd(tree) {
  const header = findNode(tree, (node) => node.props?.className === 'bis-head')
  const end = findNode(header, (node) => node.props?.['data-slot'] === 'end')
  assert.ok(end, 'missing header right group')
  assert.deepEqual(end.props.children.map((node) => node.props?.['data-slot']), ['status', 'settings'], 'status must immediately precede the menu trigger')
  assert.ok(findNode(end.props.children[1], (node) => node.type === 'button' && typeof node.props?.['aria-label'] === 'string' && typeof node.props?.onClick === 'function'))
}

test('the reserved status sits immediately beside the menu in the header right group', async () => {
  for (const language of ['en', 'zh-CN']) {
    const panel = await mountPanel({ language })
    assertHeaderEnd(panel.tree())
    const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
    assert.match(cssRule(css, '.bis-headEnd'), /gap:8px/)
    assert.match(cssRule(css, '.bis-connected'), /width:162px;min-width:162px/)
    assert.match(cssRule(css, '.bis-statusLabel'), /width:162px;min-width:162px;max-width:162px/)
    assert.match(cssRule(css, '.bis-statusLabel'), /justify-content:flex-end;gap:6px/)
    const label = findNode(panel.tree(), (node) => node.props?.['data-slot'] === 'statusText')
    assert.ok(findNode(label, (node) => node.props?.['data-primitive'] === 'StateDot'), 'dot must stay beside the right-aligned text')
    const apart = rebuild(panel.tree(), (node) => node.props?.['data-slot'] === 'end'
      ? { ...node, props: { ...node.props, children: [node.props.children[0], { type: 'span', props: { children: [] } }, node.props.children[1]] } }
      : node)
    assert.throws(() => assertHeaderEnd(apart), /status must immediately precede/)
  }
})

test('Recent results uses the larger section spacing above its heading', async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl })
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  const screen = cssRule(css, '.bis-screen')
  const recent = cssRule(css, '.bis-recent')
  assert.match(screen, /--bis-section-space:12px/)
  assert.match(screen, /gap:var\(--bis-section-space\)/)
  assert.match(recent, /margin-top:var\(--bis-section-space\)/, 'Recent needs an extra spacing token above the heading')
  assert.match(recent, /margin-bottom:var\(--bis-section-space\)/)
  assert.match(cssRule(css, '.bis-recentHead'), /margin-block:0 10px/)
  const section = findNode(panel.tree(), (node) => node.props?.className === 'bis-recent')
  const heading = findNode(section, (node) => node.props?.className === 'bis-recentHead')
  assert.ok(findNode(heading, (node) => node.type === 'h2'))
  const viewAll = findNode(heading, (node) => node.type === 'button' && textOf(node) === 'View all →')
  assert.ok(viewAll)
  assert.equal(viewAll.props['data-size'], 'sm')
})

test('the header has no Results control and View all opens the list', async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z', 5)]).fetchImpl })
  assertNoResultsInHeader(panel.tree())
  const planted = rebuild(panel.tree(), (node) =>
    node.props?.className === 'bis-head'
      ? { ...node, props: { ...node.props, children: [...node.props.children, { type: 'button', props: { children: ['Results'] } }] } }
      : node,
  )
  assert.throws(() => assertNoResultsInHeader(planted), /results in header/)
  const viewAll = findNode(panel.tree(), (node) => node.type === 'button' && textOf(node).startsWith('View all'))
  assert.ok(viewAll)
  viewAll.props.onClick()
  await panel.settle()
  assert.ok(findNode(panel.tree(), (node) => node.props?.role === 'dialog'))
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  assert.equal(css.includes('bis-resultsSlot'), false)
})

const REQUIRED_PROVIDER_SKILLS = {
  dataforseo: ['ai-prompt-research', 'ai-visibility-audit', 'backlink-profile-analysis', 'competitive-landscape', 'competitor-analysis', 'domain-onboarding', 'keyword-clustering', 'keyword-import', 'keyword-opportunity-research', 'local-seo', 'provider-setup'],
  gsc: ['keyword-clustering', 'keyword-opportunity-research', 'provider-setup', 'seo-audit'],
  serpapi: ['domain-onboarding', 'keyword-import', 'provider-setup'],
}

test('a provider checkbox keeps exactly the mapped visible skills, and toggling clears it', async () => {
  for (const [id, expected] of Object.entries(REQUIRED_PROVIDER_SKILLS)) assert.deepEqual([...PROVIDER_SKILLS[id]].sort(), id === 'dataforseo' ? expected.concat('seo-coach').sort() : expected)
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'connected', serpapi: 'connected' }) })
  await openProviderMenu(panel)
  await toggleProvider(panel, 'serpapi')
  assert.equal(providerInput(panel.tree(), 'serpapi').props.checked, true)
  assert.equal(providerInput(panel.tree(), 'gsc').props.checked, false)
  assert.deepEqual(shownSkills(panel.tree()).sort(), ['domain-onboarding', 'keyword-import', 'provider-setup'])
  await toggleProvider(panel, 'gsc')
  assert.deepEqual(shownSkills(panel.tree()).sort(), [...new Set(REQUIRED_PROVIDER_SKILLS.gsc.concat(REQUIRED_PROVIDER_SKILLS.serpapi))].sort())
  await toggleProvider(panel, 'serpapi')
  assert.deepEqual(shownSkills(panel.tree()).sort(), REQUIRED_PROVIDER_SKILLS.gsc)
  await toggleProvider(panel, 'gsc')
  await toggleProvider(panel, 'dataforseo')
  assert.deepEqual(shownSkills(panel.tree()).sort(), REQUIRED_PROVIDER_SKILLS.dataforseo)
  await toggleProvider(panel, 'dataforseo')
  assert.equal(providerInput(panel.tree(), 'all').props.checked, true)
  assert.deepEqual(shownSkills(panel.tree()), ['seo-audit', 'keyword-opportunity-research', 'rank-tracking-report', 'ai-visibility-audit', 'competitor-analysis', 'backlink-profile-analysis'])
})
test('T1: provider and category filters equal independently specified intersections', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected' }) })
  await openProviderMenu(panel)
  const pick = async (role, name) => {
    findNode(panel.tree(), (node) => node.props?.role === role && textOf(node) === name).props.onClick()
    await panel.settle()
  }
  await toggleProvider(panel, 'dataforseo')
  assert.deepEqual(shownSkills(panel.tree()).sort(), REQUIRED_PROVIDER_SKILLS.dataforseo)
  await pick('tab', 'Project')
  assert.deepEqual(shownSkills(panel.tree()).sort(), ['domain-onboarding', 'provider-setup'])
  await toggleProvider(panel, 'gsc')
  assert.deepEqual(shownSkills(panel.tree()).sort(), ['domain-onboarding', 'provider-setup'])
  await toggleProvider(panel, 'dataforseo')
  assert.deepEqual(shownSkills(panel.tree()), ['provider-setup'])
  await pick('tab', 'SEO')
  assert.deepEqual(shownSkills(panel.tree()), ['keyword-clustering'])
  await pick('tab', 'Data & reports')
  assert.deepEqual(shownSkills(panel.tree()), ['keyword-opportunity-research'])
})
test('provider options and notes render normalized host connection states', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'needs_reauth', serpapi: 'disabled' }) })
  await openProviderMenu(panel)
  const option = (id) => findNode(panel.tree(), (node) => node.props?.['data-provider'] === id)
  assert.equal(option('dataforseo').props['data-state'], 'connected')
  assert.equal(option('gsc').props['data-state'], 'needs_reauth')
  assert.equal(option('serpapi').props['data-state'], 'disabled')
  const note = () => findNode(panel.tree(), (node) => node.props?.className === 'bis-statusDetail bis-providerNote')
  assert.equal(note(), null)
  await toggleProvider(panel, 'gsc')
  assert.match(textOf(note()), /Search Console needs to be reconnected\. Reconnect/)
  const link = findNode(note(), (node) => node.type === 'a')
  assert.match(link.props.href, /providers\?connect=gsc#provider-gsc$/)
  assert.equal(link.props.target, '_blank')
  await toggleProvider(panel, 'serpapi')
  const disabled = findNode(panel.tree(), (node) => node.props?.className === 'bis-statusDetail bis-providerNote' && textOf(node).includes('SerpAPI'))
  assert.match(textOf(disabled), /SerpAPI is connected but turned off\./)
  const off = await mountPanel({ fetch: providerPanelFetch({}) })
  await openProviderMenu(off)
  await toggleProvider(off, 'dataforseo')
  const muted = findNode(off.tree(), (node) => node.props?.className === 'bis-statusDetail bis-providerNote')
  assert.match(textOf(muted), /DataForSEO is not connected\. Open providers/)
  assert.match(findNode(muted, (node) => node.type === 'a').props.href, /\/providers#provider-dataforseo$/)
  const loading = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  await openProviderMenu(loading)
  await toggleProvider(loading, 'all')
  assert.equal(findNode(loading.tree(), (node) => node.props?.className === 'bis-statusDetail bis-providerNote'), null)
})
test('the provider sentence goes only into provider-setup, domain-onboarding and keyword-import', () => {
  const rows = shapeWorkflows('example.com', 'en')
  const allowed = new Map([
    ['provider-setup', ['dataforseo', 'serpapi', 'ga4', 'gsc', 'plausible']],
    ['domain-onboarding', ['dataforseo', 'serpapi']],
    ['keyword-import', ['dataforseo', 'serpapi']],
  ])
  const sentenced = (row, provider) => providerPrompt(row, provider) !== row.prompt
  for (const row of rows) {
    for (const provider of Object.keys(PROVIDER_SKILLS).concat(['unknown'])) {
      const expected = (allowed.get(row.skill) ?? []).includes(provider)
      assert.equal(sentenced(row, provider), expected, `${row.skill} ${provider}`)
    }
  }
  const setup = rows.find((row) => row.skill === 'provider-setup')
  assert.equal(providerPrompt(setup, 'gsc'), `${setup.prompt} Use provider gsc.`)
  const onboarding = rows.find((row) => row.skill === 'domain-onboarding')
  assert.equal(providerPrompt(onboarding, 'serpapi'), `${onboarding.prompt} Use provider serpapi for the rank check.`)
  assert.equal(providerPrompt(onboarding, 'gsc'), onboarding.prompt)
  assert.equal(providerPrompt(onboarding, null), onboarding.prompt)
  const zh = shapeWorkflows('example.com', 'zh').find((row) => row.skill === 'keyword-import')
  assert.match(providerPrompt(zh, 'dataforseo'), /排名检查使用提供商 dataforseo。$/)
  const planted = { ...rows.find((row) => row.skill === 'seo-audit'), providerSentence: PROVIDER_SENTENCES['provider-setup'] && { providers: ['gsc'], text: 'Use provider {provider}.' } }
  assert.throws(() => assert.equal(sentenced(planted, 'gsc'), false))
})

test('the clicked skill writes the provider sentence only for the three skills', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'connected', serpapi: 'connected' }) })
  await openProviderMenu(panel)
  const click = async (skill) => {
    const before = panel.prompts.length
    findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-skill'] === skill).props.onClick()
    await panel.settle()
    return panel.prompts.slice(before).join(' ')
  }
  await toggleProvider(panel, 'dataforseo')
  assert.equal((await click('ai-visibility-audit')).includes('Use provider'), false)
  assert.match(await click('domain-onboarding'), /Use provider dataforseo for the rank check\./)
  await toggleProvider(panel, 'gsc')
  assert.equal((await click('seo-audit')).includes('Use provider'), false)
  assert.equal((await click('provider-setup')).includes('Use provider'), false)
  await toggleProvider(panel, 'dataforseo')
  assert.match(await click('provider-setup'), /Use provider gsc\./)
})

const LAZY_AUDIT = 'agr_abcdefghijklmnopqrstuvwx'
const LAZY_RUN = 'agr_bbbbbbbbbbbbbbbbbbbbbbbb'

function lazyOverview(projectId) {
  const body = disconnectedOverview(projectId)
  body.checklist = { audit: true, searchConsole: true, analytics: true, keywords: true }
  body.next = { id: 'weekly', skill: 'rank-tracking-report', then: 'competitor-analysis' }
  body.audit = { id: LAZY_AUDIT, createdAt: '2026-10-28T12:00:00.000Z' }
  body.searchConsole = { ...body.searchConsole, connected: true, status: 'connected' }
  body.analytics = { connected: true, needsReauth: false, status: 'connected', sessions: [], error: null }
  return body
}

function lazyProjectData() {
  const body = lazyOverview('p')
  return {
    searchConsole: { ...body.searchConsole, clicks: 13, impressions: 140, previous: { clicks: 4, impressions: 20 }, indexing: { notIndexed: 2, urls: ['https://example.com/a'] } },
    analytics: { ...body.analytics, sessions: [{ date: '2026-10-20', sessions: 40 }] },
    window: body.window,
  }
}

function lazyAuditBody(id) {
  return {
    origin: 'https://bisibility.com',
    audit: {
      id,
      createdAt: '2026-10-28T12:00:00.000Z',
      pagesCrawled: 12,
      stopReason: 'page_limit',
      topIssues: [{ severity: 'error', code: 'missing_title', message: id === LAZY_RUN ? 'Old run finding' : 'Missing title', count: 2, urls: ['https://example.com/'] }],
      pages: [],
      summary: { pages: 12 },
      requests: null,
      state: null,
      limits: null,
      limitations: [],
    },
  }
}

/**
 * A scripted panel that records which routes the client asks for.
 * @param {object} [options]
 * @param {(url: string) => Promise<Response> | Response | undefined} [options.route] answers before the defaults
 */
function lazyPanel({ route } = {}) {
  const base = panelFetch({
    overview: lazyOverview,
    projectData: lazyProjectData,
    handle: serveWorkflows((url) => {
      const early = route === undefined ? undefined : route(String(url))
      if (early !== undefined) return Promise.resolve(early).then((response) => response.clone())
      if (String(url).includes('/bisibility/recent')) {
        return Response.json({
          origin: 'https://bisibility.com',
          audits: [
            { id: LAZY_AUDIT, title: 'Crawl', createdAt: '2026-10-28T12:00:00.000Z', prompt: '/seo-audit run' },
            { id: LAZY_RUN, title: 'Crawl', createdAt: '2026-10-20T12:00:00.000Z', prompt: '/seo-audit run' },
          ],
          reports: [],
        })
      }
      if (String(url).includes('/bisibility/audit')) {
        return Response.json(lazyAuditBody(new URL(String(url), 'http://127.0.0.1').searchParams.get('id')))
      }
      return undefined
    }),
  })
  const routes = () => base.calls.map((call) => new URL(String(call.url), 'http://127.0.0.1').pathname.replace('/bisibility/', ''))
  return { fetchImpl: base.fetchImpl, routes, auditIds: () => base.calls.filter((call) => call.url.includes('/audit?')).map((call) => new URL(call.url, 'http://localhost').searchParams.get('id')) }
}

function deferred() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function assertFirstPaint(routes) {
  for (const late of ['project-data', 'audit']) if (routes.includes(late)) throw new Error(`${late} on first paint`)
  for (const early of ['overview', 'recent', 'workflows']) if (!routes.includes(early)) throw new Error(`missing ${early}`)
}


test('first paint reads the overview, recent and workflows only, and the connections row does not wait for Project data', async () => {
  const gate = deferred()
  const { fetchImpl, routes } = lazyPanel({ route: (url) => (url.includes('/bisibility/project-data') ? gate.promise : undefined) })
  const panel = await mountPanel({ fetch: fetchImpl })
  assertFirstPaint(routes())
  const shown = textOf(panel.tree())
  assert.match(shown, /Search Console connected/)
  assert.ok(findNode(panel.tree(), (node) => node.props?.className === 'bis-connections'))
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel'), null)
  assert.ok(findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-audit'] === 'latest'))
  assert.equal(routes().includes('project-data'), false)
  gate.release(Response.json({ origin: 'x', ...lazyProjectData() }))
})

test('Project data loads once on the first expand, shows a skeleton meanwhile, and stays cached', async () => {
  const gate = deferred()
  const { fetchImpl, routes } = lazyPanel({ route: (url) => (url.includes('/bisibility/project-data') ? gate.promise : undefined) })
  const panel = await mountPanel({ fetch: fetchImpl })
  const toggle = () => findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data')
  toggle().props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'project-data').length, 3)
  const waiting = findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')
  assert.equal(waiting.props['aria-busy'], 'true')
  assert.ok(findNode(waiting, (node) => node.props?.className === 'bis-metrics bis-metricsSkeleton'))
  toggle().props.onClick()
  await panel.settle()
  toggle().props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'project-data').length, 3)
  gate.release(Response.json({ origin: 'x', ...lazyProjectData(), indexing: lazyProjectData().searchConsole.indexing }))
  await panel.settle()
  const loaded = findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')
  assert.equal(loaded.props['aria-busy'], 'false')
  assert.match(textOf(loaded), /13/)
  assert.match(textOf(loaded), /40 on 2026-10-20/)
  toggle().props.onClick()
  await panel.settle()
  toggle().props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'project-data').length, 3)
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')), /13/)
})

test('Project data makes no call when neither Search Console nor Analytics is connected', async () => {
  const base = panelFetch({ handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: base.fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data').props.onClick()
  await panel.settle()
  assert.equal(base.calls.some((call) => String(call.url).includes('/bisibility/project-data')), false)
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')), /Numbers show up here/)
})

test('a failed Project data read stays inside Project data and Retry reads it again', async () => {
  let attempts = 0
  const { fetchImpl, routes } = lazyPanel({
    route(url) {
      if (!url.includes('/bisibility/project-data') || !url.includes('source=search')) return undefined
      attempts += 1
      return attempts === 1 ? Response.json({ error: { message: 'search unavailable' } }, { status: 502 }) : undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data').props.onClick()
  await panel.settle()
  const panelNode = findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')
  assertFailureBlock(findNode(panelNode, (node) => node.props?.className === 'bis-failure'), 'search unavailable', 'Search Console data could not load.')
  assert.match(textOf(panel.tree()), /Search Console connected/)
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-connections' && textOf(node).includes('could not load')), null)
  findNode(panelNode, (node) => node.type === 'button' && textOf(node) === 'Retry').props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'project-data').length, 4)
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel')), /13/)
})

test('the audit document is read once when the modal opens on a saved run, never on first paint', async () => {
  const gate = deferred()
  const { fetchImpl, routes, auditIds } = lazyPanel({ route: (url) => (url.includes('/bisibility/audit') && url.includes(LAZY_AUDIT) ? gate.promise : undefined) })
  const panel = await mountPanel({ fetch: fetchImpl })
  assert.equal(routes().includes('audit'), false)
  findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-audit'] === 'latest').props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'audit').length, 1)
  const dialog = () => findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const pending = findNode(dialog(), (node) => node.props?.className === 'bis-auditPane')
  assert.equal(pending.props['aria-busy'], 'true')
  assert.equal(findNode(dialog(), (node) => node.props?.role === 'tab'), null)
  gate.release(Response.json(lazyAuditBody(LAZY_AUDIT)))
  await panel.settle()
  assert.match(textOf(dialog()), /Missing title/)
  assert.equal(routes().filter((name) => name === 'audit').length, 1)
  findNode(dialog(), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick()
  await panel.settle()
  const rows = []
  walk(dialog(), (node) => {
    if (node.type === 'button' && node.props?.['data-audit-history']) rows.push(node)
  })
  assert.equal(rows.length, 2)
  rows.find((node) => node.props?.['data-audit-history'] === LAZY_RUN).props.onClick()
  await panel.settle()
  assert.deepEqual(auditIds(), [LAZY_AUDIT, LAZY_RUN])
  assert.match(textOf(dialog()), /Old run finding/)
  assert.equal(textOf(dialog()).includes('Missing title'), false)
  findNode(dialog(), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick()
  await panel.settle()
  rows.find((node) => node.props?.['data-audit-history'] === LAZY_AUDIT).props.onClick()
  await panel.settle()
  assert.deepEqual(auditIds(), [LAZY_AUDIT, LAZY_RUN])
})

test('a failed audit read shows a failure inside the modal and Retry reads it again', async () => {
  let attempts = 0
  const { fetchImpl, routes } = lazyPanel({
    route(url) {
      if (!url.includes('/bisibility/audit')) return undefined
      attempts += 1
      return attempts === 1 ? Response.json({ error: { message: 'saved audit unavailable' } }, { status: 502 }) : undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['data-audit'] === 'latest').props.onClick()
  await panel.settle()
  const dialog = () => findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assertFailureBlock(findNode(dialog(), (node) => node.props?.className === 'bis-failure'), 'saved audit unavailable', 'The site audit could not load.')
  assert.equal(routes().filter((name) => name === 'audit').length, 1)
  findNode(dialog(), (node) => node.type === 'button' && textOf(node) === 'Retry').props.onClick()
  await panel.settle()
  assert.equal(routes().filter((name) => name === 'audit').length, 2)
  assert.match(textOf(dialog()), /Missing title/)
})

test('the traffic suggestion appears once Project data has loaded the Analytics history', async () => {
  const { fetchImpl } = lazyPanel()
  const panel = await mountPanel({ fetch: fetchImpl })
  assert.equal(textOf(panel.tree()).includes('Why did my traffic drop?'), false)
  assert.match(textOf(panel.tree()), /Compare a competitor/)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Project data').props.onClick()
  await panel.settle()
  assert.match(textOf(panel.tree()), /Why did my traffic drop\?/)
})


// Review regressions: list payloads have no audit bodies; source reads settle independently.
const dataToggle = (panel) => findNode(panel.tree(), (node) => node.props?.['aria-controls'] === 'bis-project-data');
const dataPanel = (panel) => findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel');
const auditDialog = (panel) => findNode(panel.tree(), (node) => node.props?.role === 'dialog');

test('F1: indexing draft uses the lazy count and URLs when overview indexing is null', async () => {
  const panel = await mountPanel({ fetch: lazyPanel().fetchImpl });
  dataToggle(panel).props.onClick();
  await panel.settle();
  findNode(dataPanel(panel), (node) => node.type === 'button' && textOf(node) === 'Ask about these pages').props.onClick();
  await panel.settle();
  assert.equal(panel.prompts.at(-1), '/seo-audit 2 pages are not indexed for example.com.\nhttps://example.com/a');
});

test('F2: focus revalidates expired lazy data and fresh connections hide disconnected metrics', async () => {
  let now = 100000;
  let connected = true;
  let clicks = 13;
  const base = panelFetch({
    overview: (id) => connected ? lazyOverview(id) : disconnectedOverview(id),
    projectData: () => ({ ...lazyProjectData(), searchConsole: { ...lazyProjectData().searchConsole, clicks }, window: { start: '2026-10-02', end: '2026-10-29' } }),
    handle: serveWorkflows(),
  });
  const panel = await mountPanel({ fetch: base.fetchImpl, now: () => now });
  dataToggle(panel).props.onClick();
  await panel.settle();
  assert.match(textOf(dataPanel(panel)), /2026-10-02.*2026-10-29/);
  const initialReads = base.calls.filter((call) => call.url.includes('/project-data')).length;
  clicks = 27;
  now += 61000;
  panel.focus();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await panel.settle();
  assert.ok(base.calls.filter((call) => call.url.includes('/project-data')).length > initialReads);
  assert.match(textOf(dataPanel(panel)), /27/);
  connected = false;
  now += 61000;
  panel.focus();
  await new Promise((resolve) => setTimeout(resolve, 350));
  await panel.settle();
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-connections')), /Search Console not connected/);
  assert.equal(textOf(dataPanel(panel)).includes('27'), false);
});

test('F3: an initial Recent failure has a visible retry and a loading slot before successful empty', async () => {
  const gate = deferred();
  let count = 0;
  const base = panelFetch({ handle: serveWorkflows((url) => {
    if (!url.includes('/recent')) return undefined;
    count += 1;
    return count === 1 ? gate.promise : Response.json({ audits: [], reports: [] });
  }) });
  const panel = await mountPanel({ fetch: base.fetchImpl });
  assert.ok(findNode(panel.tree(), (node) => node.props?.className === 'bis-recent'));
  gate.release(Response.json({ error: { message: 'upstream' } }, { status: 502 }));
  await panel.settle();
  const section = findNode(panel.tree(), (node) => node.props?.className === 'bis-recent');
  assert.ok(findNode(section, (node) => node.props?.role === 'alert'));
  findNode(section, (node) => node.type === 'button' && textOf(node) === 'Retry').props.onClick();
  await panel.settle();
  assert.equal(count, 2);
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-recent'), null);
});

test('F4: Analytics and query stats remain visible while indexing fails independently', async () => {
  const search = deferred();
  const indexing = deferred();
  const panel = await mountPanel({ fetch: lazyPanel({ route: (url) => {
    if (!url.includes('/project-data')) return undefined;
    const source = new URL(url, 'http://localhost').searchParams.get('source');
    if (source === 'search') return search.promise;
    if (source === 'indexing') return indexing.promise;
    if (source === 'analytics') return Response.json({ ...lazyProjectData(), analytics: { connected: true, sessions: [{ sessions: 1150, date: '2026-10-29' }], error: null } });
    return new Promise(() => {});
  } }).fetchImpl });
  dataToggle(panel).props.onClick();
  await panel.settle();
  assert.match(textOf(dataPanel(panel)), /1,150/);
  search.release(Response.json(lazyProjectData()));
  indexing.release(Response.json({ indexing: { notIndexed: null, urls: [], error: { message: 'indexing failed' } } }));
  await panel.settle();
  assert.match(textOf(dataPanel(panel)), /13/);
  assert.match(textOf(dataPanel(panel)), /1,150/);
  assert.ok(findNode(dataPanel(panel), (node) => node.type === 'button' && textOf(node) === 'Retry'));
});

test('F5: connections render before delayed overview audit and keyword reads', async () => {
  const gate = deferred();
  const panel = await mountPanel({ fetch: lazyPanel({ route: (url) => url.includes('/overview') ? gate.promise : undefined }).fetchImpl });
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.className === 'bis-connections')), /Search Console connected/);
  gate.release(Response.json(lazyOverview(PANEL_PROJECT)));
  await panel.settle();
});

test('F6: lazy stop reason, date and page count replace list-only metadata in summary and History', async () => {
  const body = lazyAuditBody(LAZY_RUN);
  Object.assign(body.audit, { stopReason: 'time_limit', pagesCrawled: 5, createdAt: '2026-10-21T12:00:00.000Z' });
  const panel = await mountPanel({ fetch: lazyPanel({ route: (url) => url.includes('/audit?') ? Response.json(body) : undefined }).fetchImpl });
  findNode(panel.tree(), (node) => node.props?.['data-recent-open'] === LAZY_RUN).props.onClick();
  await panel.settle();
  const meta = findNode(auditDialog(panel), (node) => node.props?.className === 'bis-modalMeta');
  assert.match(textOf(meta), /Time limit.*Oct 21.*5 pages crawled/);
  assert.equal(textOf(meta).includes('Completed'), false);
  findNode(auditDialog(panel), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick();
  await panel.settle();
  const row = findNode(auditDialog(panel), (node) => node.type === 'button' && node.props?.['data-audit-history'] === LAZY_RUN);
  assert.match(textOf(row), /Oct 21.*Time limit.*5 pages crawled/);
});

test('F7: metric and audit loading phases reserve the same source, action and tab slots', async () => {
  const data = deferred();
  const audit = deferred();
  const panel = await mountPanel({ fetch: lazyPanel({ route: (url) => url.includes('/project-data') ? data.promise : url.includes('/audit?') ? audit.promise : undefined }).fetchImpl });
  dataToggle(panel).props.onClick();
  await panel.settle();
  const slots = () => {
    const keys = [];
    walk(dataPanel(panel), (node) => { if (node.props?.['data-metric']) keys.push(node.props['data-metric']); });
    return keys;
  };
  assert.deepEqual(slots().sort(), ['clicks', 'ctr', 'impressions', 'indexing', 'position', 'sessions']);
  assert.ok(findNode(dataPanel(panel), (node) => node.props?.className === 'bis-indexingActionSlot'));
  data.release(Response.json({ ...lazyProjectData(), indexing: lazyProjectData().searchConsole.indexing }));
  await panel.settle();
  assert.deepEqual(slots().sort(), ['clicks', 'ctr', 'impressions', 'indexing', 'position', 'sessions']);
  findNode(panel.tree(), (node) => node.props?.['data-audit'] === 'latest').props.onClick();
  await panel.settle();
  assert.ok(findNode(auditDialog(panel), (node) => node.props?.className === 'bis-auditTabs'));
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'));
  assert.match(cssRule(css, '.bis-modal.bis-modal'), /height:auto/);
  audit.release(Response.json(lazyAuditBody(LAZY_AUDIT)));
  await panel.settle();
});

test('F8: provider menu and whole-row Recent actions use DSH controls', async () => {
  const panel = await mountPanel({ fetch: lazyPanel().fetchImpl })
  assert.equal(providerTrigger(panel.tree()).props['data-primitive'], 'Button')
  await openProviderMenu(panel)
  for (const id of ['all', 'dataforseo', 'gsc', 'serpapi']) {
    const option = findNode(panel.tree(), (node) => node.props?.['data-provider'] === id)
    assert.ok(findNode(option, (node) => node.props?.['data-primitive'] === 'Checkbox'))
  }
  assert.equal(findNode(panel.tree(), (node) => node.props?.['data-recent-open'] === LAZY_RUN).props['data-primitive'], 'Button')
})

function assertLoadedProjectSlot(tree) {
  const slot = findNode(tree, (node) => node.props?.['data-slot'] === 'project')
  assert.ok(slot)
  assert.equal(findNode(slot, (node) => node.props?.className === 'bis-slotBone'), null, 'loaded project slot must not retain a skeleton')
  const controls = []
  walk(slot, (node) => { if (node.type === 'button') controls.push(node) })
  assert.equal(controls.length, 1, 'the select must be the only loaded project control')
}


test('the loaded project slot reserves space without painting a second control', async () => {
  const fixture = panelFetch({ projects: [{ id: PANEL_PROJECT, domain: 'supatable.co' }, { id: PANEL_OTHER, domain: 'other.example.com' }], handle: serveWorkflows() })
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  assertLoadedProjectSlot(panel.tree())
  const ghost = rebuild(panel.tree(), (node) => node.props?.['data-slot'] === 'project'
    ? { ...node, props: { ...node.props, children: [...node.props.children, { type: 'span', props: { className: 'bis-slotBone', children: [] } }] } } : node)
  assert.throws(() => assertLoadedProjectSlot(ghost), /must not retain a skeleton/)
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  for (const selector of ['.bis-projectSlot', '.bis-projectSwitch']) {
    assert.match(cssRule(css, selector), /background:transparent/)
    assert.match(cssRule(css, selector), /border:0/)
  }
})

test('AI visibility keeps its category and supports AEO and GEO searches in English and Chinese', async () => {
  for (const [language, label] of [['en', 'AI visibility'], ['zh-CN', 'AI 可见性']]) {
    const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl, language })
    const tab = findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === label)
    assert.ok(tab, 'renamed AI visibility category')
    const input = findNode(panel.tree(), (node) => node.type === 'input' && node.props?.type === 'search')
    for (const term of ['AEO', 'geo', ' AeO ']) {
      input.props.onChange({ target: { value: term } })
      await panel.settle()
      assert.deepEqual(shownSkills(panel.tree()).sort(), ['ai-prompt-research', 'ai-visibility-audit'])
    }
  }
})

test('audit findings omit counts without a unit and use themed tooltip links', async () => {
  const panel = await mountPanel({ fetch: panelFetch({ overview: finishedAudit, handle: serveWorkflows() }).fetchImpl })
  await openSkillAudit(panel)
  const row = findNode(panel.tree(), (node) => node.props?.className === 'bis-finding' && textOf(node).includes('Missing title'))
  assert.equal(findNode(row, (node) => node.props?.className === 'bis-findingCount'), null, 'unitless finding count')
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  assert.match(cssRule(css, '.bis-findingUrl'), /color:var\(--dsw-alias-link\)/)
  assert.match(cssRule(css, '.bis-findingUrl'), /text-decoration:none/)
  assert.match(cssRule(css, '.bis-findingUrl:hover,.bis-findingUrl:focus-visible'), /text-decoration:underline/)
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /TruncatedTooltip, \{ label: url/)
})

test('audit modal bounds and tab labels share a panel inset while its footer wraps', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-modalRoot.bis-modalRoot'), /padding:16px/)
  assert.match(cssRule(source, '.bis-modal.bis-modal'), /width:min\(880px,100%\)/)
  assert.match(cssRule(source, '.bis-auditTabList button'), /padding:4px 8px/)
  assert.match(cssRule(source, '.bis-auditGate'), /white-space:normal/)
  assert.match(cssRule(source, '.bis-auditGate'), /overflow-wrap:anywhere/)
})

test('recent row hover and focus preserve the column inside a padded hit area', async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl })
  const css = textOf(findNode(panel.tree(), (node) => node.type === 'style'))
  const row = cssRule(css, '.bis-recentOpen')
  assert.match(row, /padding:8px 12px/)
  assert.match(row, /margin-inline:-12px/)
  assert.match(row, /width:calc\(100% \+ 24px\)/)
  assert.match(row, /border-radius:var\(--dsw-radius-md/)
  assert.match(cssRule(css, '.bis-recentSlot'), /padding:4px 16px/)
  assert.match(cssRule(css, '.bis-recentSlot'), /margin:-4px -16px/)
  for (const selector of ['.bis-recentOpen:hover', '.bis-recentOpen:focus-visible']) {
    const state = cssRule(css, selector)
    assert.match(state, /background:var\(--dsw-alias-interactive-bg-hover\)/)
    assert.equal(/padding:|margin:|width:|transform:/.test(state), false)
  }
  assert.match(cssRule(css, '.bis-recentAll'), /padding-inline:12px;margin-inline-end:-12px/)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'View all →').props.onClick()
  await panel.settle()
  const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  assert.ok(findNode(dialog, (node) => node.props?.className === 'bis-recentOpen' && node.props?.['data-primitive'] === 'Button'), 'Results must share the padded row control')
})

function assertLabelUnderline(source) {
  const label = cssRule(source, '.bis-auditTabList .bis-tabLabel')
  assert.match(label, /display:inline-block/)
  const line = cssRule(source, '.bis-auditTabList .bis-tabLabel::after')
  assert.match(line, /inset-inline:0/, 'underline must follow both label edges')
  assert.match(line, /height:2px/)
  assert.equal(/width:|%/.test(line), false, 'underline must size from the label')
  assert.match(line, /background:var\(--dsw-alias-label-tertiary\)/)
  assert.match(cssRule(source, '.bis-auditTabList button[aria-selected=true] .bis-tabLabel::after'), /background:var\(--dsw-alias-brand-primary\)/)
  assert.match(cssRule(source, '.bis-auditTabList button:is(:hover,:focus-visible) .bis-tabLabel::after'), /opacity:1/)
  assert.match(cssRule(source, focusSelectors), /outline:2px solid var\(--dsw-focus-ring-color/)
}

test('audit underline tabs size their active and hover lines from the label text', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assertLabelUnderline(source)
  assert.throws(() => assertLabelUnderline(source.replace('inset-inline:0', 'left:25%;width:50%')), /both label edges/)
})


test('suggestion chips wrap without changing their height or outline', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-suggests'), /flex-wrap:wrap/)
  assert.match(cssRule(source, '.bis-suggests'), /gap:8px/)
  assert.match(cssRule(source, '.bis-suggest'), /height:28px/)
  assert.match(cssRule(source, '.bis-suggest'), /border:1px solid var\(--bis-outline-subtle\)/)
})

test('focus rings have outer clearance and audit underlines stay inside padded controls', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const focus = cssRule(source, focusSelectors)
  assert.match(focus, /outline:2px solid var\(--dsw-focus-ring-color/)
  assert.match(focus, /outline-offset:2px/)
  assert.match(focus, /box-shadow:none/)
  assert.match(cssRule(source, '.bis-auditTabList'), /border-radius:0/)
  assert.match(cssRule(source, '.bis-auditTabList button'), /padding:4px 8px/)
  assert.match(cssRule(source, '.bis-auditTabList .bis-tabLabel::after'), /bottom:-3px/)
})

test('keyboard category navigation focuses and reveals the newly selected tab', async () => {
  const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  const tabs = tabsOf(panel)
  const calls = []
  const targets = tabs.map((_, index) => ({
    focus: (options) => calls.push(['focus', index, options]),
    scrollIntoView: (options) => calls.push(['scroll', index, options]),
  }))
  tabs[0].props.onKeyDown({ key: 'End', preventDefault() {}, currentTarget: { parentElement: { querySelectorAll: () => targets } } })
  await panel.settle()
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['focus', 5, { preventScroll: true }], ['scroll', 5, { block: 'nearest', inline: 'nearest' }]])
  assert.equal(textOf(tabsOf(panel).find((node) => node.props['aria-selected'] === 'true')), 'Project')
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/)
})

test('header menus retain native trigger anchors and portal their options outside the slots', async () => {
  const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  for (const label of ['Project', 'Settings']) {
    const trigger = findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['aria-label'] === label)
    assert.ok(trigger)
    trigger.props.onClick()
    await panel.settle()
    const menu = findNode(panel.tree(), (node) => node.props?.role === 'menu')
    assert.equal(menu.props['data-portal'], 'true')
    assert.equal(menu.props['data-native-anchor'], 'true')
    assert.ok(findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['aria-label'] === label))
    if (label === 'Project') {
      findNode(menu, (node) => node.type === 'button').props.onClick()
      await panel.settle()
    }
  }
})

test('capped query sums are visibly partial in both locales', async () => {
  const base = panelFetch({ overview: lazyOverview, projectData: () => ({ ...lazyProjectData(), searchConsole: { ...lazyProjectData().searchConsole, partial: true, truncated: true } }), handle: serveWorkflows() });
  for (const language of ['en-US', 'zh-CN']) {
    const panel = await mountPanel({ fetch: base.fetchImpl, language });
    dataToggle(panel).props.onClick();
    await panel.settle();
    assert.match(textOf(dataPanel(panel)), language === 'en-US' ? /Partial.*1,000/ : /部分.*1,000/);
  }
});

test('provider-only payloads render connected before any metric fields exist', async () => {
  const base = panelFetch({ overview: lazyOverview, handle: serveWorkflows((url) => url.includes('/connections')
    ? Response.json({ searchConsole: { connected: true, needsReauth: false, status: 'connected', error: null }, analytics: { connected: true, status: 'connected', error: null }, providers: [] })
    : undefined) });
  const panel = await mountPanel({ fetch: base.fetchImpl });
  assert.match(textOf(panel.tree()), /Search Console connected/);
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataPanel'), null);
});

test('an old in-flight metric response cannot refill a cache invalidated by disconnect', async () => {
  let now = 100000;
  let connected = true;
  const old = deferred();
  let reads = 0;
  const base = panelFetch({
    overview: (id) => connected ? lazyOverview(id) : disconnectedOverview(id),
    projectData: () => ({ ...lazyProjectData(), searchConsole: { ...lazyProjectData().searchConsole, clicks: 29 } }),
    handle: serveWorkflows((url) => {
      if (!url.includes('/project-data') || !url.includes('source=search')) return undefined;
      reads += 1;
      return reads === 1 ? old.promise : undefined;
    }),
  });
  const panel = await mountPanel({ fetch: base.fetchImpl, now: () => now });
  dataToggle(panel).props.onClick(); await panel.settle();
  connected = false; now += 61000; panel.focus();
  await new Promise((resolve) => setTimeout(resolve, 350)); await panel.settle();
  now += 60000;
  old.release(Response.json(lazyProjectData())); await panel.settle();
  connected = true; now += 1000; panel.focus();
  await new Promise((resolve) => setTimeout(resolve, 350)); await panel.settle();
  assert.equal(reads, 2);
  assert.match(textOf(dataPanel(panel)), /29/);
});

test('compact header and Ask use one row and stacked full-width fields without header skeleton paint', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.equal(source.includes('bis-slotBone'), false, 'reserved header slots never paint skeletons')
  assert.equal(source.includes('grid-template-rows:28px 28px'), false, 'header stays on one row')
  assert.match(source, /@container \(max-width:560px\)/)
  assert.match(source, /\.bis-askRow\{flex-direction:column\}/)
  assert.match(source, /\.bis-statusCopy\{[^}]*clip:rect\(0 0 0 0\)/)
  assert.match(cssRule(source, '.bis-scroll'), /scrollbar-gutter:stable both-edges/)
})

test('header menus use padded native item buttons with checks and constrained labels', async () => {
  const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows() }).fetchImpl })
  findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['aria-label'] === 'Project').props.onClick()
  await panel.settle()
  const menu = findNode(panel.tree(), (node) => node.props?.role === 'menu')
  assert.ok(findNode(menu, (node) => node.props?.['data-primitive'] === 'MenuItemButton'), 'native menu items')
  assert.ok(findNode(menu, (node) => node.props?.className === 'bis-menuCheck'), 'selected check')
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-menuList>[role=presentation]'), /padding:6px;gap:4px/)
  assert.match(cssRule(source, '.bis-menuList [role=menuitem]'), /padding:8px 12px/)
  assert.match(cssRule(source, '.bis-menuLabel'), /text-overflow:ellipsis/)
})

test('History uses auto-height dated rows without visible raw run ids and one footer primary', async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl })
  findNode(panel.tree(), (node) => node.props?.['data-recent-open']).props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick()
  await panel.settle()
  const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
  const row = findNode(dialog, (node) => node.props?.['data-audit-history'])
  assert.ok(row, 'History row data id')
  assert.equal(textOf(row).includes('agr_'), false, 'raw run id is not visible')
  assert.match(textOf(findNode(row, (node) => node.props?.className === 'bis-recentName')), /\d{1,2}:\d{2}/, 'History title retains its localized time')
  const footer = findNode(dialog, (node) => node.props?.className === 'bis-auditActions')
  const primaries = []
  walk(footer, (node) => { if (node.props?.['data-variant'] === 'primary') primaries.push(textOf(node)) })
  assert.deepEqual(primaries, ['Review with agent'])
})

test('offset focus has padded rounded tabs and clipping-container clearance', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, focusSelectors), /outline-offset:2px/, 'outward focus offset')
  assert.match(cssRule(source, '.bis-auditTabList button'), /padding:4px 8px/)
  assert.match(cssRule(source, '.bis-auditTabList button'), /border-radius:var\(--dsw-radius-sm/)
  assert.match(cssRule(source, '.bis-auditTabList'), /padding:4px 12px/)
  assert.match(cssRule(source, '.bis-tabs'), /padding:6px/)
  assert.match(cssRule(source, '.bis-recentSlot'), /padding:4px 16px/)
})

test('shared result rows are compact medium-weight two-line controls with four-pixel gaps', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-recentOpen'), /min-height:54px/, 'compact row height')
  assert.match(cssRule(source, '.bis-recentOpen'), /height:auto/)
  assert.match(cssRule(source, '.bis-recentOpen'), /padding:8px 12px/)
  assert.match(cssRule(source, '.bis-recentOpen'), /margin-inline:-12px/)
  assert.match(cssRule(source, '.bis-recentText'), /gap:2px/)
  assert.match(cssRule(source, '\n.bis-recentList'), /gap:4px/)
  assert.equal(source.includes('.bis-recentList:has(>.bis-recentItem){gap:0}'), false)
})

test('result row titles use medium weight without changing modal headings', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(cssRule(source, '.bis-recentName'), /font-size:14px;font-weight:500/, 'row title medium weight')
  assert.match(cssRule(source, '.bis-modalTitle,.bis-modal [class*="_title_"]'), /font-size:16px;line-height:24px;font-weight:500/)
})

function assertNoModalContent(tree) {
  assert.equal(findNode(tree, (node) => node.props?.role === 'dialog'), null, 'closed modal remains mounted')
  assert.equal(findNode(tree, (node) => /(?:^| )bis-modalInner(?: |$)/.test(node.props?.className || '')), null, 'closed modal body remains mounted')
  assert.equal(findNode(tree, (node) => node.props?.className === 'bis-findingUrl'), null, 'closed finding link remains mounted')
}

test('audit close and reopen remove the entire modal subtree in both locales', async () => {
  for (const language of ['en', 'zh-CN']) {
    const panel = await mountPanel({ fetch: panelFetch({ overview: finishedAudit, handle: serveWorkflows() }).fetchImpl, language })
    assertNoModalContent(panel.tree())
    for (let attempt = 0; attempt < 2; attempt++) {
      await openSkillAudit(panel)
      const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
      assert.ok(findNode(dialog, (node) => node.props?.className === 'bis-findingUrl'))
      findNode(dialog, (node) => node.props?.['aria-label'] === (language === 'en' ? 'Close' : '关闭')).props.onClick()
      await panel.settle()
      assertNoModalContent(panel.tree())
    }
  }
})

test('Results close and reopen remove the entire modal subtree in both locales', async () => {
  for (const language of ['en', 'zh-CN']) {
    const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl, language })
    for (let attempt = 0; attempt < 2; attempt++) {
      findNode(panel.tree(), (node) => node.props?.className === 'bis-recentAll').props.onClick()
      await panel.settle()
      const dialog = findNode(panel.tree(), (node) => node.props?.role === 'dialog')
      assert.ok(findNode(dialog, (node) => node.props?.className === 'bis-recentOpen'))
      findNode(dialog, (node) => node.props?.['aria-label'] === (language === 'en' ? 'Close' : '关闭')).props.onClick()
      await panel.settle()
      assertNoModalContent(panel.tree())
    }
  }
})

test('shared modal shell explicitly centers its portal and has an immediate DSH scrim', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const root = cssRule(source, '.bis-modalRoot.bis-modalRoot')
  assert.match(root, /align-items:center;justify-content:center/, 'explicit modal centering')
  assert.match(cssRule(source, '.bis-modal.bis-modal'), /animation:none;opacity:1/, 'dialog must not linger at partial opacity')
  assert.match(cssRule(source, '.bis-modalRoot>\[aria-hidden=true\]::after'), /background:var\(--dsw-alias-bg-mask-1\);animation:none;opacity:1/, 'DSH scrim immediately visible')
})

test('loaded Recent preview uses only its rendered row count and hides successful empty lists', async () => {
  for (const count of [1, 2, 3]) {
    const audits = Array.from({ length: count }, (_, i) => recentAudit(i + 1, `2026-10-${20 + i}T12:00:00.000Z`))
    const panel = await mountPanel({ fetch: recentFetch(audits).fetchImpl })
    const slot = findNode(panel.tree(), (node) => node.props?.className === 'bis-recentSlot')
    const rows = []
    walk(slot, (node) => { if (node.props?.['data-recent-open']) rows.push(node) })
    assert.equal(rows.length, count)
    assert.match(cssRule(textOf(findNode(panel.tree(), (node) => node.type === 'style')), '.bis-recentSlot'), /height:auto/, 'loaded section must not reserve empty rows')
    assert.equal(slot.props['data-state'], 'loaded')
  }
  const empty = await mountPanel({ fetch: recentFetch([]).fetchImpl })
  assert.equal(findNode(empty.tree(), (node) => node.props?.className === 'bis-recent'), null)
})

test('pending Recent preview reserves at most two skeleton rows', async () => {
  const gate = deferred()
  const panel = await mountPanel({ fetch: panelFetch({ handle: serveWorkflows((url) => String(url).includes('/bisibility/recent') ? gate.promise : undefined) }).fetchImpl })
  const pending = findNode(panel.tree(), (node) => node.props?.className === 'bis-recentPending')
  assert.ok(pending)
  assert.equal(pending.props.children.length, 2, 'loading placeholder count')
  gate.release(Response.json({ audits: [recentAudit(1, '2026-10-20T12:00:00.000Z')], reports: [] }))
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-recentPending'), null)
})

test('native saved-result and URL tooltips show truncated text on hover and focus only', tooltipDOMOptions, () => {
  assertTooltipDOM('rows')
})

test('provider multi-select uses OR, category AND, and All providers restores the unfiltered catalog', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({ dataforseo: 'connected', gsc: 'needs_reauth', serpapi: 'not_connected' }) })
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'All skills').props.onClick()
  await panel.settle()
  await openProviderMenu(panel)
  const catalog = shapeWorkflows('example.com', 'en').filter((row) => !row.router)
  const selected = new Set()
  for (const ids of [[], ['dataforseo'], ['gsc'], ['serpapi'], ['gsc', 'dataforseo'], ['serpapi', 'dataforseo'], ['gsc', 'serpapi'], ['gsc', 'serpapi', 'dataforseo'], []]) {
    for (const id of ['gsc', 'serpapi', 'dataforseo']) if (selected.has(id) !== ids.includes(id)) await toggleProvider(panel, id)
    selected.clear()
    for (const id of ids) selected.add(id)
    assert.equal(providerInput(panel.tree(), 'all').props.checked, ids.length === 0)
    for (const id of ['gsc', 'serpapi', 'dataforseo']) assert.equal(providerInput(panel.tree(), id).props.checked, ids.includes(id))
    for (const [category, label] of [['all', 'All'], ['project', 'Project'], ['data-reports', 'Data & reports'], ['seo', 'SEO']]) {
      findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === label).props.onClick()
      await panel.settle()
      const expected = catalog.filter((row) => (category === 'all' || row.surface === category) && (ids.length === 0 || ids.some((id) => REQUIRED_PROVIDER_SKILLS[id].includes(row.skill)))).map((row) => row.skill).sort()
      assert.deepEqual(shownSkills(panel.tree()).sort(), expected, `${category}: ${ids}`)
    }
    findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'All').props.onClick()
    await panel.settle()
  }
  await toggleProvider(panel, 'dataforseo')
  await toggleProvider(panel, 'all')
  assert.deepEqual(shownSkills(panel.tree()).sort(), catalog.map((row) => row.skill).sort())
  for (const skill of ['alert-triage', 'project-setup', 'rank-tracking-report', 'weekly-report', 'team-api-governance']) assert.ok(shownSkills(panel.tree()).includes(skill))
})
test('provider sentences require exactly one valid selection for that skill', () => {
  for (const locale of ['en', 'zh']) {
    for (const row of shapeWorkflows('example.com', locale)) {
      for (const ids of [[], ['gsc'], ['dataforseo'], ['serpapi'], ['gsc', 'dataforseo'], ['gsc', 'serpapi'], ['dataforseo', 'serpapi'], ['gsc', 'dataforseo', 'serpapi']]) {
        const valid = ['provider-setup', 'domain-onboarding', 'keyword-import'].includes(row.skill) ? ids.filter((id) => row.skill === 'provider-setup' || id !== 'gsc') : []
        assert.equal(providerPrompt(row, ids), valid.length === 1 ? providerPrompt(row, valid[0]) : row.prompt, `${locale} ${row.skill} ${ids}`)
      }
    }
  }
})

test('modal dialog surface is content sized and bounded at every panel width', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const shell = cssRule(source, '.bis-modal.bis-modal')
  assert.match(shell, /height:auto/, 'dialog needs automatic height')
  assert.match(shell, /max-height:min\(80dvh,var\(--bis-modal-max-height\)\)/)
  assert.equal(/height:min\(640px|height:calc\(100% \+ 32px\)|max-width:none/.test(source), false)
  assert.match(source, /dialog\.style\.width/, 'bound the real native dialog surface')
  assert.match(source, /dialog\.style\.maxWidth/)
})

test('native tooltip guards remeasure resize and font transitions with positive overflow controls', tooltipDOMOptions, async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl })
  const check = () => walk(panel.tree(), (node) => {
    assert.equal(node.props?.title, undefined, 'native title bypasses truncation')
    if (node.props?.['data-tooltip'] && textOf(node).trim()) assert.notEqual(textOf(node).trim(), node.props['data-tooltip'], 'tooltip duplicates fitting visible text')
  })
  check()
  findNode(panel.tree(), (node) => node.props?.className === 'bis-projectName' && node.type === 'button').props.onClick()
  await panel.settle()
  check()
  findNode(panel.tree(), (node) => node.props?.className === 'bis-iconButton').props.onClick()
  await panel.settle()
  check()
  findNode(panel.tree(), (node) => node.props?.['data-recent-open']).props.onClick()
  await panel.settle()
  check()
  assertTooltipDOM('transitions')
})

test('prefill shows success only after confirmation and clears stale success on a new attempt', async () => {
  let result = { status: 'ready' }
  const panel = await mountPanel({ fetch: providerPanelFetch({}), startPrompt: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result) })
  const click = () => findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Preview a first audit').props.onClick()
  const ready = 'The prompt is in the composer. Press Enter to send it.'
  click()
  await panel.settle()
  assert.equal(textOf(panel.tree()).split(ready).length - 1, 1)
  for (const failed of [undefined, { ok: false, error: { message: 'No session was created' } }, new Error('draft.workspaceRequired'), { status: 'copied' }]) {
    result = failed
    click()
    await panel.settle()
    assert.equal(textOf(panel.tree()).includes(ready), false)
  }
  assert.match(textOf(panel.tree()), /Prompt copied\. Create a workspace in DSH so bisibility can prefill prompts/)
})

test('pending and superseded draft attempts cannot publish a success notice', async () => {
  const pending = deferred()
  let attempt = 0
  const panel = await mountPanel({ fetch: providerPanelFetch({}), startPrompt: () => ++attempt === 1 ? pending.promise : Promise.reject(new Error('draft.workspaceRequired')) })
  const click = () => findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Preview a first audit').props.onClick()
  click()
  await panel.settle()
  assert.equal(textOf(panel.tree()).includes('Press Enter to send it.'), false)
  click()
  await panel.settle()
  pending.release({ status: 'ready' })
  await panel.settle()
  assert.equal(textOf(panel.tree()).includes('Press Enter to send it.'), false)
  assert.match(textOf(panel.tree()), /Choose a workspace to start a conversation/)
})

test('copied prompt notice stays inline with primary explicit navigation and secondary dismiss in both languages', async () => {
  for (const [language, hint, open, dismiss] of [
    ['en-US', 'Prompt copied. Create a workspace in DSH so bisibility can prefill prompts, or open a new conversation and paste it.', 'Open new conversation', 'Dismiss'],
    ['zh-CN', '提示已复制。请在 DSH 中创建工作区，以便 bisibility 自动填入提示；也可以打开新对话并粘贴提示。', '打开新对话', '关闭提示'],
  ]) {
    let navigations = 0
    const panel = await mountPanel({ language, fetch: providerPanelFetch({}), startPrompt: async () => ({ status: 'copied', openConversation: () => { navigations += 1 } }) })
    const firstSkill = () => findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'rank-tracking-report')
    firstSkill().props.onClick()
    await panel.settle()
    const notice = () => findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice')
    assert.ok(notice(), 'persistent inline notice missing')
    assert.match(textOf(notice()), new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(navigations, 0)
    assert.equal(textOf(panel.tree()).includes('Press Enter to send it.'), false)
    const button = findNode(notice(), (node) => node.type === 'button' && textOf(node) === open)
    assert.equal(button.props['data-variant'], 'primary')
    button.props.onClick()
    button.props.onClick()
    await panel.settle()
    assert.equal(navigations, 1, 'duplicate navigation')
    const close = findNode(notice(), (node) => node.type === 'button' && textOf(node) === dismiss)
    assert.equal(close.props['data-variant'], 'outline')
    close.props.onClick()
    await panel.settle()
    assert.equal(notice(), null)
  }
})

test('copied notice survives failed attempts and clears on workspace appearance or confirmed prefill', async () => {
  const listeners = new Set()
  let result = { status: 'copied', openConversation() {}, watchWorkspace: (fn) => { listeners.add(fn); return () => listeners.delete(fn) } }
  const panel = await mountPanel({ fetch: providerPanelFetch({}), startPrompt: () => result instanceof Error ? Promise.reject(result) : result })
  const click = () => findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'rank-tracking-report').props.onClick()
  const notice = () => findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice')
  click()
  await panel.settle()
  assert.ok(notice())
  assert.equal(listeners.size, 1)
  const copied = result
  result = new Error('Creation refused')
  click()
  await panel.settle()
  assert.ok(notice(), 'a failed attempt must not dismiss guidance')
  for (const fn of listeners) fn()
  await panel.settle()
  assert.equal(notice(), null)
  assert.equal(listeners.size, 0)
  result = copied
  click()
  await panel.settle()
  assert.ok(notice())
  result = { status: 'ready' }
  click()
  await panel.settle()
  assert.equal(notice(), null)
  assert.equal(listeners.size, 0)
  assert.equal(textOf(panel.tree()).split('The prompt is in the composer. Press Enter to send it.').length - 1, 1)
})

test('audit copy fallback closes the modal so its inline guidance is visible', async () => {
  const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl, startPrompt: async () => ({ status: 'copied', openConversation() {} }) })
  findNode(panel.tree(), (node) => node.props?.['data-recent-open']).props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Review with agent').props.onClick()
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.role === 'dialog'), null)
  assert.ok(findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice'))
})

test('late Ask copy preserves an Audit or Results modal opened during discovery', async () => {
  for (const surface of ['audit', 'results']) {
    const pending = deferred()
    const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl, startPrompt: () => pending.promise })
    findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Preview a first audit').props.onClick()
    await panel.settle()
    if (surface === 'audit') await openAuditPreparation(panel)
    else {
      findNode(panel.tree(), (node) => node.props?.className === 'bis-recentAll').props.onClick()
      await panel.settle()
    }
    const title = findNode(panel.tree(), (node) => node.props?.role === 'dialog').props['aria-label']
    pending.release({ status: 'copied', openConversation() {} })
    await panel.settle()
    assert.equal(findNode(panel.tree(), (node) => node.props?.role === 'dialog')?.props['aria-label'], title, `late Ask copy closed ${surface}`)
  }
})

test('late audit-review copy preserves a reopened audit instance and unrelated Results', async () => {
  for (const surface of ['audit', 'results']) {
    const pending = deferred()
    const panel = await mountPanel({ fetch: recentFetch([recentAudit(1, '2026-10-20T12:00:00.000Z')]).fetchImpl, startPrompt: () => pending.promise })
    findNode(panel.tree(), (node) => node.props?.['data-recent-open']).props.onClick()
    await panel.settle()
    findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Review with agent').props.onClick()
    await panel.settle()
    findNode(panel.tree(), (node) => node.props?.className === 'bis-modalClose').props.onClick()
    await panel.settle()
    if (surface === 'audit') await openAuditPreparation(panel)
    else {
      findNode(panel.tree(), (node) => node.props?.className === 'bis-recentAll').props.onClick()
      await panel.settle()
    }
    const title = findNode(panel.tree(), (node) => node.props?.role === 'dialog').props['aria-label']
    pending.release({ status: 'copied', openConversation() {} })
    await panel.settle()
    assert.equal(findNode(panel.tree(), (node) => node.props?.role === 'dialog')?.props['aria-label'], title, `late review copy closed ${surface}`)
  }
})

test('a stale Workspace observer cannot dismiss a newer copied-prompt notice', async () => {
  const observers = []
  const result = { status: 'copied', openConversation() {}, watchWorkspace: (fn) => { observers.push(fn); return () => {} } }
  const panel = await mountPanel({ fetch: providerPanelFetch({}), startPrompt: () => result })
  const click = () => findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'rank-tracking-report').props.onClick()
  click()
  await panel.settle()
  click()
  await panel.settle()
  observers[0]()
  await panel.settle()
  assert.ok(findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice'), 'old observer dismissed newer notice')
  observers[1]()
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice'), null)
})

test('an explicit conversation failure stays visible in the notice and permits a retry', async () => {
  const panel = await mountPanel({ fetch: providerPanelFetch({}), startPrompt: async () => ({ status: 'copied', openConversation: async () => { throw new Error('Navigation refused') } }) })
  findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'rank-tracking-report').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Open new conversation').props.onClick()
  await panel.settle()
  const notice = findNode(panel.tree(), (node) => node.props?.className === 'bis-notice bis-workspaceNotice')
  assert.match(textOf(findNode(notice, (node) => node.props?.role === 'alert')), /Navigation refused/)
  assert.equal(findNode(notice, (node) => node.type === 'button' && textOf(node) === 'Open new conversation').props.disabled, false)
})

for (const language of ['en-US', 'zh-CN']) {
  test(`Project data renders complete totals, actual dates and freshness in ${language}`, async () => {
    const data = lazyProjectData();
    data.searchConsole = { ...data.searchConsole, clicks: 321, impressions: 8765, ctr: 0.0366, position: 7.25,
      partial: false, truncated: true, window: { start: '2026-10-02', end: '2026-10-29' },
      dataWindow: { start: '2026-10-10', end: '2026-10-27' },
      freshness: { data_state: 'all', fetched_at: '2026-10-29T12:00:00Z', finalized_through: null, first_incomplete_date: '2026-10-27' },
    };
    const base = panelFetch({ overview: lazyOverview, projectData: () => data, handle: serveWorkflows() });
    const panel = await mountPanel({ fetch: base.fetchImpl, language });
    findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataToggle').props.onClick();
    await panel.settle();
    const card = findNode(panel.tree(), (node) => node.props?.['data-source'] === 'search');
    const shown = textOf(card);
    for (const key of ['clicks', 'impressions', 'ctr', 'position']) assert.ok(findNode(card, (node) => node.props?.['data-metric'] === key), key);
    for (const value of ['321', '8,765', '3.66%', '7.3', '2026-10-02', '2026-10-29', '2026-10-10', '2026-10-27', '2026-10-29T12:00:00Z']) assert.ok(shown.includes(value), value);
    assert.match(shown, language === 'en-US' ? /Clicks.*Impressions.*CTR.*Average position/s : /点击.*展示.*点击率.*平均排名/s);
    assert.match(shown, language === 'en-US' ? /May include provisional data/ : /可能包含暂定数据/);
    assert.match(shown, language === 'en-US' ? /Finalized through: unknown/ : /已最终确定至：未知/);
    assert.equal(/Partial sums|部分合计/.test(shown), false);
  });
}

test('Project data retains partial query sums for a standalone MCP', async () => {
  const data = lazyProjectData();
  data.searchConsole.partial = true;
  data.searchConsole.truncated = false;
  const base = panelFetch({ overview: lazyOverview, projectData: () => data, handle: serveWorkflows() });
  const panel = await mountPanel({ fetch: base.fetchImpl });
  findNode(panel.tree(), (node) => node.props?.className === 'bis-projectDataToggle').props.onClick();
  await panel.settle();
  assert.match(textOf(findNode(panel.tree(), (node) => node.props?.['data-source'] === 'search')), /Partial sums of up to 1,000 query rows/);
});

test('unknown skills and groups keep their real labels with a neutral identity', async () => {
  const known = shapeWorkflows('example.com', 'en').find((row) => row.skill === 'rank-tracking-report')
  for (const change of [{ skill: 'future-tool' }, { surface: 'future-group' }, { skill: 'toString', surface: '__proto__' }]) {
    const workflow = { ...known, ...change, title: 'Future workflow' }
    const { fetchImpl } = panelFetch({ handle(url) {
      if (url.includes('/bisibility/workflows')) return Response.json({ workflows: [workflow] })
      return undefined
    } })
    const panel = await mountPanel({ fetch: fetchImpl })
    const tile = findNode(panel.tree(), (node) => node.props?.className === 'bis-skillTile')
    assert.ok(tile)
    assert.equal(tile.props['data-surface'], 'unknown')
    const glyph = findNode(tile, (node) => node.type === 'svg')
    assert.equal(glyph.props['data-phosphor'], change.skill ? 'PuzzlePiece' : 'Ranking')
    assert.match(textOf(panel.tree()), /Future workflow/)
    const action = findNode(panel.tree(), (node) => node.props?.['data-skill'] === workflow.skill)
    assert.ok(action, 'the original workflow action is preserved')
  }
})

async function chooseReviewProject(panel, label) {
  findNode(panel.tree(), (node) => node.type === 'button' && node.props?.['aria-label'] === 'Project').props.onClick()
  await panel.settle()
  const item = findNode(panel.tree(), (node) => node.props?.role === 'menuitem' && textOf(node).includes(label))
  assert.ok(item, `missing project ${label}`)
  item.props.onClick()
  await panel.settle()
}

test('review: initial project failure exposes Retry and recovers', async () => {
  let count = 0
  const fixture = panelFetch({ handle: serveWorkflows((url) => {
    if (url === '/bisibility/projects' && count++ === 0) return Response.json({ error: { message: 'temporary outage' } }, { status: 502 })
  }) })
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  const block = findNode(panel.tree(), (node) => node.props?.className === 'bis-failure')
  assert.ok(block, 'first project failure must be visible')
  findNode(block, (node) => node.type === 'button' && textOf(node) === 'Retry').props.onClick()
  await panel.settle()
  assert.equal(count, 2)
  assert.ok(findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'seo-audit'))
})

test('review: a switched project never exposes the previous catalog while pending or failed', async () => {
  const gate = deferred()
  const row = (domain) => ({ skill: 'keyword-import', title: 'Import keywords', line: 'Prepare keywords', action: 'Review changes', prompt: `/keyword-import ${domain}`, pack: 'workflow', surface: 'seo' })
  const fixture = panelFetch({
    projects: [{ id: PANEL_PROJECT, name: 'One', domain: 'example.com' }, { id: PANEL_OTHER, name: 'Two', domain: 'example.org' }],
    handle(url) {
      if (url.includes('/workflows')) return url.includes(PANEL_OTHER) ? gate.promise : Response.json({ workflows: [row('example.com')] })
    },
  })
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  assert.ok(findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'keyword-import'))
  await chooseReviewProject(panel, 'Two')
  assert.equal(findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'keyword-import'), null, 'pending catalog must not expose the previous project prompt')
  gate.release(Response.json({ error: { message: 'catalog unavailable' } }, { status: 502 }))
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'keyword-import'), null)
  assert.ok(findNode(panel.tree(), (node) => node.props?.className === 'bis-failure'))
  assert.deepEqual(panel.prompts, [])
})

test('review: rerunning a historical audit selects the newly returned report', async () => {
  const newId = 'agr_' + 'n'.repeat(24)
  const fixture = lazyPanel({ route: (url) => url === '/bisibility/audit' ? Response.json(lazyAuditBody(newId)) : undefined })
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  findNode(panel.tree(), (node) => node.props?.['data-audit'] === 'latest').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.props?.role === 'tab' && textOf(node) === 'History').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.props?.['data-audit-history'] === LAZY_RUN).props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Run again').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Review with agent').props.onClick()
  await panel.settle()
  assert.ok(panel.prompts.at(-1).includes(newId), 'review must target the new audit')
  assert.equal(panel.prompts.at(-1).includes(LAZY_RUN), false)
})

test('review: returning to a project preserves its in-flight crawl guard', async () => {
  const gate = deferred()
  const fixture = panelFetch({
    projects: [{ id: PANEL_PROJECT, name: 'One', domain: 'example.com' }, { id: PANEL_OTHER, name: 'Two', domain: 'example.org' }],
    handle: serveWorkflows((url, init) => url === '/bisibility/audit' && init.method === 'POST' ? gate.promise : undefined),
  })
  const panel = await mountPanel({ fetch: fixture.fetchImpl })
  await openAuditPreparation(panel)
  findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit').props.onClick()
  await panel.settle()
  findNode(panel.tree(), (node) => node.props?.['aria-label'] === 'Close').props.onClick()
  await panel.settle()
  await chooseReviewProject(panel, 'Two')
  await chooseReviewProject(panel, 'One')
  const action = findNode(panel.tree(), (node) => node.props?.['data-skill'] === 'seo-audit')
  assert.equal(textOf(action), 'View progress')
  action.props.onClick()
  await panel.settle()
  assert.equal(findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Start audit'), null)
  assert.equal(fixture.calls.filter((call) => call.url === '/bisibility/audit' && call.init.method === 'POST').length, 1)
  gate.release(Response.json(lazyAuditBody(LAZY_AUDIT)))
  await panel.settle()
  assert.ok(findNode(panel.tree(), (node) => node.type === 'button' && textOf(node) === 'Run again'))
})
