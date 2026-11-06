import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SKILL_GESTURE, shippedSkillNames } from '../skills.js'
import {
  CATEGORY_PALETTE,
  WORKFLOW_BADGES,
  WORKFLOW_SKILL_NAMES,
  WORKFLOWS,
  shapeWorkflows,
  showProjectSwitcher,
  skillCategoryTabs,
  skillGridColumns,
  skillLabels,
  validateWorkflowManifest,
  visibleStartSkills,
} from '../workflows.js'

/** The 20 skills. Used when the generated file is not on this machine. */
const FROZEN = [
  'project-setup',
  'seo-coach',
  'domain-onboarding',
  'bisibility',
  'seo-audit',
  'ai-visibility-audit',
  'keyword-opportunity-research',
  'keyword-import',
  'rank-tracking-report',
  'weekly-report',
  'alert-triage',
  'backlink-profile-analysis',
  'provider-setup',
  'team-api-governance',
  'self-host-health',
  'keyword-clustering',
  'competitor-analysis',
  'competitive-landscape',
  'ai-prompt-research',
  'local-seo',
]

/**
 * Skill names from the generated file when that checkout is present.
 * @returns names, or null when the file is absent.
 */
function generatedSkillNames() {
  const configured = process.env.BISIBILITY_PLUGIN_SKILLS
  const path =
    typeof configured === 'string' && configured.trim() !== ''
      ? configured.trim()
      : join(homedir(), 'Projects', 'corgicorner', 'bisibility', 'bisibility-private', 'lib', 'agent-ready', 'plugin-skill-files.generated.json')
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('generated skill file is not an object')
  }
  if (parsed.version === 2 && parsed.skills !== null && typeof parsed.skills === 'object') return Object.keys(parsed.skills)
  return Object.keys(parsed)
}

function skillNames() {
  return generatedSkillNames() ?? FROZEN
}

test('workflow catalog ships every bundled skill', () => {
  const names = skillNames()
  assert.deepEqual([...names].sort(), [...FROZEN].sort())
  assert.deepEqual([...WORKFLOW_SKILL_NAMES].sort(), shippedSkillNames())
  assert.equal(WORKFLOW_SKILL_NAMES.length, 19)
  assert.equal(WORKFLOW_SKILL_NAMES.includes('self-host-health'), false)
  for (const name of FROZEN) {
    if (name === 'self-host-health') continue
    assert.equal(WORKFLOW_SKILL_NAMES.includes(name), true, name)
  }
  validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
  const skills = WORKFLOWS.map((entry) => entry.skill)
  assert.equal(new Set(skills).size, skills.length)
  for (const entry of WORKFLOWS) {
    assert.equal(WORKFLOW_SKILL_NAMES.includes(entry.skill), true, entry.skill)
    assert.equal(WORKFLOW_SKILL_NAMES.includes(entry.promptSkill), true, entry.promptSkill)
    assert.equal(WORKFLOW_BADGES.includes(entry.badge), true, entry.badge)
    assert.equal(entry.title.en.trim().length > 0, true)
    assert.equal(entry.title.zh.trim().length > 0, true)
    assert.equal(entry.line.en.trim().length > 0, true)
    assert.equal(entry.line.zh.trim().length > 0, true)
  }
  assert.equal(WORKFLOWS.some((entry) => entry.skill === 'get_capabilities'), false)
  for (const row of shapeWorkflows('example.com', 'en')) {
    const match = SKILL_GESTURE.exec(row.prompt)
    assert.ok(match, row.skill)
    assert.equal(match[2], row.promptSkill, row.skill)
    assert.equal(row.prompt.includes('bisibility:'), false, row.skill)
    assert.equal(row.prompt.startsWith(`/${row.promptSkill} `), true, row.skill)
  }
})

test('workflow guard rejects an unknown skill, then the manifest still validates', () => {
  const planted = structuredClone(WORKFLOWS)
  planted[0] = { ...planted[0], skill: 'not-a-real-skill' }
  assert.throws(() => validateWorkflowManifest(planted, WORKFLOW_SKILL_NAMES), /unknown skill not-a-real-skill/)
  validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
})

test('workflow badges match the phase 0 skill map', () => {
  const expected = {
    'seo-coach': 'free',
    'bisibility': 'free',
    'domain-onboarding': 'free',
    'keyword-import': 'free',
    'project-setup': 'free',
    'seo-audit': 'credits',
    'ai-visibility-audit': 'credits',
    'keyword-opportunity-research': 'search-console',
    'rank-tracking-report': 'free',
    'weekly-report': 'free',
    'alert-triage': 'free',
    'backlink-profile-analysis': 'credits',
    'provider-setup': 'free',
    'team-api-governance': 'free',
    'keyword-clustering': 'credits',
    'competitor-analysis': 'credits',
    'competitive-landscape': 'credits',
    'ai-prompt-research': 'credits',
    'local-seo': 'free',
  }
  assert.deepEqual(
    Object.fromEntries(WORKFLOWS.map((entry) => [entry.skill, entry.badge])),
    expected,
  )
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'seo-audit').estimate, null)
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'ai-prompt-research').estimate, null)
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'keyword-clustering').estimate, 'estimate_only on get_keyword_metrics')
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'ai-visibility-audit').estimate, 'estimate_only before a paid comparison')
  const packs = {
    'seo-coach': 'router',
    bisibility: 'router',
    'domain-onboarding': 'project-onboarding',
    'keyword-import': 'project-onboarding',
  }
  for (const [skill, pack] of Object.entries(packs)) {
    const entry = WORKFLOWS.find((row) => row.skill === skill)
    assert.equal(entry.pack, pack, skill)
    assert.equal(entry.promptSkill, skill, skill)
    assert.equal(entry.badge, 'free', skill)
  }
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'weekly-report').promptSkill, 'rank-tracking-report')
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'weekly-report').rest.decision, 'twin')
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'provider-setup').rest.decision, 'mark')
  assert.equal(WORKFLOWS.find((entry) => entry.skill === 'team-api-governance').rest.decision, 'mark')
  const coach = WORKFLOWS.find((entry) => entry.skill === 'seo-coach')
  assert.equal(coach.prompt.en.includes('Do not run that skill'), true)
  const route = WORKFLOWS.find((entry) => entry.skill === 'bisibility')
  assert.equal(route.prompt.en.includes('Do not run that skill'), true)
  const domain = WORKFLOWS.find((entry) => entry.skill === 'domain-onboarding')
  assert.equal(domain.prompt.en.includes('Do not run a rank check'), true)
  assert.equal(domain.prompt.en.includes('Do not claim a provider is connected'), true)
  const imported = WORKFLOWS.find((entry) => entry.skill === 'keyword-import')
  assert.equal(imported.prompt.en.includes('Do not run a rank check'), true)
  assert.equal(imported.prompt.en.includes('provider-setup'), true)
  assert.equal(WORKFLOWS.some((entry) => entry.skill === 'self-host-health'), false)
  const shaped = shapeWorkflows('example.com', 'en')
  assert.equal(shaped.find((entry) => entry.skill === 'seo-coach').pack, 'router')
  assert.equal(shaped.find((entry) => entry.skill === 'project-setup').pack, null)
  const planted = structuredClone(WORKFLOWS)
  planted.find((entry) => entry.skill === 'ai-prompt-research').badge = 'free'
  assert.throws(() => validateWorkflowManifest(planted, WORKFLOW_SKILL_NAMES), /ai-prompt-research/)
  const missingEstimate = structuredClone(WORKFLOWS)
  missingEstimate.find((entry) => entry.skill === 'keyword-clustering').estimate = null
  assert.throws(() => validateWorkflowManifest(missingEstimate, WORKFLOW_SKILL_NAMES), /missing estimate for keyword-clustering/)
  validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
})

test('workflow guard rejects a bad badge, then the manifest still validates', () => {
  const planted = structuredClone(WORKFLOWS)
  planted[1] = { ...planted[1], badge: 'premium' }
  assert.throws(() => validateWorkflowManifest(planted, WORKFLOW_SKILL_NAMES), /bad badge premium/)
  validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
})

test('start skills sort by available data and hide the routers', () => {
  const rows = shapeWorkflows('example.com', 'en')
  const sparse = visibleStartSkills(rows, {}, 'all')
  assert.deepEqual(
    sparse.slice(0, 6).map((row) => row.skill),
    ['seo-audit', 'keyword-opportunity-research', 'rank-tracking-report', 'ai-visibility-audit', 'competitor-analysis', 'backlink-profile-analysis'],
  )
  assert.equal(sparse.some((row) => row.skill === 'seo-coach' || row.skill === 'bisibility' || row.router === true), false)
  assert.equal(sparse.some((row) => row.skill === 'project-setup'), true)
  assert.equal(visibleStartSkills(rows, { searchConsole: true }, 'all')[0].skill, 'keyword-opportunity-research')
  const audit = rows.find((row) => row.skill === 'seo-audit')
  const queries = rows.find((row) => row.skill === 'keyword-opportunity-research')
  assert.deepEqual(skillLabels(audit, { known: false }), [])
  assert.deepEqual(skillLabels(audit, {}), ['no-audit'])
  assert.deepEqual(skillLabels(audit, { audit: true }), ['saved'])
  assert.deepEqual(skillLabels(queries, {}), ['connect-search'])
  assert.deepEqual(skillLabels(queries, { searchConsole: true }), ['search-console'])
  const plantedQuery = { ...queries, billing: 'estimate' }
  assert.throws(() => assertQueryLabel(plantedQuery, { searchConsole: true }), /estimate label/)
  assertQueryLabel(queries, { searchConsole: true })
  const alerts = rows.find((row) => row.skill === 'alert-triage')
  assert.throws(() => assertAlertCard({ ...alerts, action: 'Review changes' }, { keywords: false }), /review changes/)
  assert.throws(() => assertAlertCard({ ...alerts, needs: 'keywords' }, { keywords: false }), /keywords label/)
  assertAlertCard(alerts, { keywords: true })
  assertAlertCard(alerts, { keywords: false })
  assert.equal(skillLabels(queries, {}).length <= 2, true)
  assert.equal(skillGridColumns(320), 1)
  assert.equal(skillGridColumns(560), 2)
  assert.equal(skillGridColumns(860), 3)
  assert.throws(() => skillGridColumns(Number.NaN), /panel width must be a finite number/)
  assert.equal(skillGridColumns(860), 3)
  assert.equal(showProjectSwitcher(0), false)
  assert.equal(showProjectSwitcher(1), false)
  assert.equal(showProjectSwitcher(2), true)
  assert.throws(() => showProjectSwitcher(1.5), /project count must be a whole number/)
  assert.equal(showProjectSwitcher(2), true)
})

test('every visible skill has one category and empty categories stay off the tabs', () => {
  const rows = shapeWorkflows('example.com', 'en')
  const visible = rows.filter((row) => row.router !== true)
  const expected = {
    seo: [
      'rank-tracking-report',
      'keyword-clustering',
      'keyword-import',
      'competitor-analysis',
      'competitive-landscape',
      'backlink-profile-analysis',
      'local-seo',
    ],
    'ai-search': ['ai-visibility-audit', 'ai-prompt-research'],
    'site-health': ['seo-audit'],
    'data-reports': ['keyword-opportunity-research', 'weekly-report', 'alert-triage'],
    project: ['project-setup', 'domain-onboarding', 'provider-setup', 'team-api-governance'],
    social: [],
  }
  const seen = new Map()
  for (const row of visible) {
    assert.equal(seen.has(row.skill), false, row.skill)
    seen.set(row.skill, row.surface)
    assert.equal(Object.hasOwn(expected, row.surface), true, row.skill)
  }
  assert.equal(visible.length, 17)
  for (const [surface, skills] of Object.entries(expected)) {
    const found = visible.filter((row) => row.surface === surface).map((row) => row.skill).sort()
    assert.deepEqual(found, [...skills].sort(), surface)
  }
  const routers = rows.filter((row) => row.router === true)
  assert.deepEqual(routers.map((row) => row.skill).sort(), ['bisibility', 'seo-coach'])
  assert.equal(routers.every((row) => row.surface === 'project'), true)
  assert.equal(visibleStartSkills(rows, {}, 'project').some((row) => row.router === true), false)
  assert.equal(visibleStartSkills(rows, {}, 'social').length, 0)
  const tabs = skillCategoryTabs(rows)
  assert.deepEqual(tabs, ['seo', 'ai-search', 'site-health', 'data-reports', 'project'])
  assert.equal(tabs.includes('social'), false)
  for (const id of tabs) assert.equal(visibleStartSkills(rows, {}, id).length > 0, true)
  assert.deepEqual(CATEGORY_PALETTE.seo, ['#0b3d91', '#22b8f0', '#f2fbff', '#1f6fd6', '#031033'])
  assert.deepEqual(CATEGORY_PALETTE['ai-search'], ['#1f1150', '#9b6cff', '#f5f0ff', '#5b34d6', '#0d0626'])
  assert.deepEqual(CATEGORY_PALETTE['site-health'], ['#0a3b2c', '#2fd08a', '#f1fff8', '#14916a', '#021a12'])
  assert.deepEqual(CATEGORY_PALETTE['data-reports'], ['#4a1d05', '#ff7a1a', '#fff6ea', '#e0a020', '#1f0a02'])
  assert.deepEqual(CATEGORY_PALETTE.social, ['#3d0a2e', '#ff4f6d', '#fff1f4', '#d0257f', '#1a0313'])
  assert.deepEqual(CATEGORY_PALETTE.project, ['#2a2c2f', '#9aa0a6', '#f4f5f6', '#5f646a', '#0e0f10'])
})

test('workflow guard rejects missing zh, then the manifest still validates', () => {
  const planted = structuredClone(WORKFLOWS)
  const target = planted.find((entry) => entry.skill === 'project-setup')
  target.title = { ...target.title, zh: '' }
  assert.throws(() => validateWorkflowManifest(planted, WORKFLOW_SKILL_NAMES), /missing zh for project-setup title/)
  validateWorkflowManifest(WORKFLOWS, WORKFLOW_SKILL_NAMES)
})

function assertQueryLabel(item, state) {
  const labels = skillLabels(item, state)
  if (labels.includes('estimate')) throw new Error('estimate label')
  if (state.searchConsole === true && !labels.includes('search-console')) throw new Error('search console label')
}

function assertAlertCard(item, state) {
  const english = typeof item.action === 'string' ? item.action : item.action.en
  if (english === 'Review changes') throw new Error('review changes')
  if (english !== 'Review alerts') throw new Error('review alerts')
  const labels = skillLabels(item, state)
  if (labels.includes('add-keywords')) throw new Error('keywords label')
  if (!labels.includes('no-alerts')) throw new Error('alerts label')
}
