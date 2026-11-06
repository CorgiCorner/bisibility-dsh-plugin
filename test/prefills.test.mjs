import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recentPrompt } from '../ask.js'
import { SKILL_GESTURE, shippedSkillNames } from '../skills.js'
import { shapeWorkflows } from '../workflows.js'
import { disconnectedOverview, findNode, mountPanel, panelFetch, textOf, walk } from './panel-harness.mjs'

const AUDIT = 'agr_abcdefghijklmnopqrstuvwx'
const REPORT = 'agr_bbbbbbbbbbbbbbbbbbbbbbbb'

/**
 * First slash skill in these prompts that is not registered.
 * @param {string[]} prompts
 * @returns {string | null}
 */
function unregisteredHit(prompts) {
  const shipped = new Set(shippedSkillNames())
  const gesture = new RegExp(SKILL_GESTURE.source, 'g')
  for (const prompt of prompts) {
    for (const match of prompt.matchAll(gesture)) {
      if (!shipped.has(match[2])) return match[2]
    }
  }
  return null
}

/**
 * Prompts the catalog and recent builders return.
 * @returns {string[]}
 */
function builderPrompts() {
  const prompts = []
  for (const locale of ['en', 'zh']) {
    for (const domain of ['example.com', '']) {
      for (const row of shapeWorkflows(domain, locale)) prompts.push(row.prompt)
    }
  }
  prompts.push(recentPrompt('audit', { id: AUDIT, title: 'Crawl' }, 'example.com'))
  prompts.push(recentPrompt('audit', { id: AUDIT, title: 'Crawl' }, ''))
  for (const kind of [
    'ai_visibility',
    'prompt_explorer',
    'prompt_research',
    'ai_visibility_audit',
    'ai_prompt_research',
    'seo_audit',
    'site_audit',
    'local_seo',
    'keyword_clustering',
    'competitor_analysis',
    'competitive_landscape',
    'external_analysis',
    '',
  ]) {
    prompts.push(recentPrompt('report', { id: REPORT, kind, title: 'Report' }, 'example.com'))
  }
  return prompts
}

/**
 * @param {object} tree
 * @param {string} label
 * @returns {object[]}
 */
function buttons(tree, label) {
  const found = []
  walk(tree, (node) => {
    if (node.type === 'button' && textOf(node) === label) found.push(node)
  })
  return found
}

/**
 * Click the panel controls that write a composer prompt.
 * @returns {Promise<string[]>}
 */
async function clickedPrompts() {
  const workflows = shapeWorkflows('example.com', 'en')
  const auditPrompt = recentPrompt('audit', { id: AUDIT, title: 'Crawl' }, 'example.com')
  const reportPrompt = recentPrompt('report', { id: REPORT, kind: 'external_analysis', title: 'Note' }, 'example.com')
  const overview = (projectId) => {
    const body = disconnectedOverview(projectId)
    body.checklist = { audit: true, searchConsole: true, analytics: true, keywords: false }
    body.next = { id: 'keywords', skill: 'project-setup' }
    body.audit = { id: AUDIT, pagesCrawled: 4, stopReason: 'finished', topIssues: [], createdAt: '2026-10-28T12:00:00.000Z' }
    body.searchConsole = {
      ...body.searchConsole,
      connected: true,
      indexing: { notIndexed: 2, urls: ['https://example.com/a', 'https://example.com/missing'] },
    }
    return body
  }
  const { fetchImpl } = panelFetch({
    overview,
    handle(url) {
      if (url.includes('/bisibility/workflows')) {
        return Response.json({ origin: 'https://bisibility.com', workflows, categories: [] })
      }
      if (url.includes('/bisibility/recent')) {
        return Response.json({
          origin: 'https://bisibility.com',
          audits: [{ id: AUDIT, title: 'Crawl', prompt: auditPrompt }],
          reports: [{ id: REPORT, title: 'Note', prompt: reportPrompt }],
        })
      }
      return undefined
    },
  })
  const panel = await mountPanel({ fetch: fetchImpl })
  const expectPrefill = (click, skill) => {
    const before = panel.prompts.length
    click()
    assert.equal(panel.prompts.length, before + 1, `${skill}: one prefill`)
    const prompt = panel.prompts.at(-1)
    assert.equal(typeof prompt, 'string', `${skill}: DSH accepts text, not a structured skill part`)
    assert.equal(prompt.startsWith(`/${skill} `), true, `${skill}: whitespace-bounded native invocation`)
  }
  const tree = panel.tree()
  for (const [label, skill] of [
    ['Review site issues', 'seo-audit'],
    ['Show my search queries', 'keyword-opportunity-research'],
    ['Compare a competitor', 'competitor-analysis'],
  ]) {
    const chip = buttons(tree, label)
    assert.equal(chip.length, 1, label)
    expectPrefill(() => chip[0].props.onClick(), skill)
  }
  const question = '/keyword-opportunity-research Find saved queries; do not buy research.'
  findNode(panel.tree(), (node) => node.props?.id === 'bis-ask').props.onChange({ target: { value: question } })
  await panel.settle()
  expectPrefill(() => findNode(panel.tree(), (node) => node.type === 'form' && node.props.className === 'bis-ask').props.onSubmit({ preventDefault() {} }), 'keyword-opportunity-research')
  assert.equal(panel.prompts.at(-1), `${question} for example.com`)
  const opener = buttons(tree, 'View latest')
  assert.equal(opener.length, 1)
  opener[0].props.onClick()
  await panel.settle()
  const explain = buttons(panel.tree(), 'Review with agent')
  assert.equal(explain.length, 1)
  expectPrefill(() => explain[0].props.onClick(), 'seo-audit')
  assert.equal(panel.prompts.at(-1).includes(AUDIT), true)
  buttons(tree, 'Project data')[0].props.onClick()
  await panel.settle()
  const indexing = buttons(panel.tree(), 'Ask about these pages')
  assert.equal(indexing.length, 1)
  expectPrefill(() => indexing[0].props.onClick(), 'seo-audit')
  assert.equal(panel.prompts.at(-1).includes('https://example.com/missing'), true)
  const clickSkills = () => {
    const catalog = []
    walk(panel.tree(), (node) => {
      if (node.type === 'button' && typeof node.props['data-skill'] === 'string') catalog.push(node)
    })
    for (const button of catalog) {
      const skill = button.props['data-skill']
      if (skill === 'seo-audit') {
        const before = panel.prompts.length
        button.props.onClick()
        assert.equal(panel.prompts.length, before, 'the audit card opens the native crawl flow')
      } else {
        const workflow = workflows.find((row) => row.skill === skill)
        expectPrefill(() => button.props.onClick(), workflow.promptSkill)
      }
    }
    return catalog.map((button) => button.props['data-skill'])
  }
  const more = buttons(tree, 'All skills')
  if (more.length > 0) more[0].props.onClick()
  await panel.settle()
  const clicked = new Set(clickSkills())
  assert.equal(clicked.size, workflows.filter((row) => row.router !== true).length)
  const recent = []
  walk(panel.tree(), (node) => {
    if (node.props?.['data-recent'] !== AUDIT && node.props?.['data-recent'] !== REPORT) return
    const open = findNode(node, (child) => child.type === 'button' && typeof child.props['data-recent-open'] === 'string')
    if (open) recent.push(open)
  })
  assert.equal(recent.length, 2)
  for (const button of recent) {
    if (button.props['data-recent-open'] === AUDIT) button.props.onClick()
    else expectPrefill(() => button.props.onClick(), 'seo-audit')
  }
  return panel.prompts
}

test('no prefill names an unregistered skill, and a planted name fails once', async () => {
  const prompts = builderPrompts().concat(await clickedPrompts())
  assert.equal(prompts.length > 20, true)
  assert.equal(unregisteredHit(prompts), null)
  const planted = prompts.concat(['/not-a-skill explain the saved report'])
  assert.equal(unregisteredHit(planted), 'not-a-skill')
  assert.equal(unregisteredHit(prompts), null)
})
