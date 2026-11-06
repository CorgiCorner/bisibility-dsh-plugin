import { invocablePrompt, shippedSkillNames } from './skills.js'

const SHIPPED = new Set(shippedSkillNames())

/**
 * Saved report kind to the shipped skill that explains it.
 * An unknown kind uses seo-audit, which is shipped and already explains saved evidence.
 */
const REPORT_SKILL = {
  ai_visibility: 'ai-visibility-audit',
  prompt_explorer: 'ai-visibility-audit',
  prompt_research: 'ai-visibility-audit',
  ai_visibility_audit: 'ai-visibility-audit',
  ai_prompt_research: 'ai-prompt-research',
  seo_audit: 'seo-audit',
  site_audit: 'seo-audit',
  local_seo: 'local-seo',
  keyword_clustering: 'keyword-clustering',
  competitor_analysis: 'competitor-analysis',
  competitive_landscape: 'competitive-landscape',
}

/**
 * @param kind - agent report kind, possibly empty.
 * @returns a shipped skill name.
 */
function skillForReport(kind) {
  const skill = Object.prototype.hasOwnProperty.call(REPORT_SKILL, kind) ? REPORT_SKILL[kind] : 'seo-audit'
  if (!SHIPPED.has(skill)) throw new Error(`report skill ${skill} is not shipped`)
  return skill
}

/** How many saved rows the recent list keeps from each tool. */
export const RECENT_LIMIT = 5

/**
 * The single next step for a project the overview already loaded.
 * No project is handled in the panel, before this route runs.
 * @param checklist - audit, Search Console, and keyword flags.
 * @returns the step id. Keyword and weekly steps name a skill.
 */
export function featuredStep(checklist) {
  const flags = checklist !== null && typeof checklist === 'object' ? checklist : {}
  if (flags.audit !== true && flags.audit !== null) return { id: 'audit' }
  if (flags.searchConsole !== true && flags.searchConsole !== null) return { id: 'search-console' }
  if (flags.keywords !== true && flags.keywords !== null) return { id: 'keywords', skill: 'project-setup' }
  return { id: 'weekly', skill: 'rank-tracking-report', then: 'competitor-analysis' }
}

/** Skill token for each ask suggestion. Every name is a shipped skill. */
const ASK_SUGGESTION_SKILLS = {
  issues: 'seo-audit',
  audit: 'seo-audit',
  queries: 'keyword-opportunity-research',
  traffic: 'seo-audit',
  compare: 'competitor-analysis',
  mentions: 'ai-visibility-audit',
}

/**
 * Three ask suggestions for the project state the panel already has.
 * Search queries appear only when Search Console is connected.
 * The traffic question appears only when the caller has Analytics connected with snapshots.
 * @param state - `hasAudit`, `searchConsole`, and `trafficHistory` flags.
 * @returns three `{ id, skill }` rows.
 */
export function askSuggestions(state) {
  const flags = state !== null && typeof state === 'object' ? state : {}
  const picks = [flags.hasAudit === true ? 'issues' : 'audit']
  if (flags.searchConsole === true) picks.push('queries')
  picks.push(flags.trafficHistory === true ? 'traffic' : 'compare')
  if (picks.length < 3) picks.push('mentions')
  return picks.slice(0, 3).map((id) => {
    const skill = ASK_SUGGESTION_SKILLS[id]
    if (!SHIPPED.has(skill)) throw new Error(`ask suggestion ${id} uses an unshipped skill`)
    return { id, skill }
  })
}

/**
 * Prefill for one saved audit or report. The leading token is a real skill name.
 * @param kind - `audit` or `report`.
 * @param row - a saved row with an `agr_` id.
 * @param domain - project domain, or an empty string.
 * @returns the composer text.
 */
export function recentPrompt(kind, row, domain) {
  const id = row !== null && typeof row === 'object' && typeof row.id === 'string' ? row.id : ''
  const title = row !== null && typeof row === 'object' && typeof row.title === 'string' && row.title.trim() !== '' ? row.title.trim() : id
  const name = typeof domain === 'string' ? domain.trim() : ''
  const where = name === '' ? '' : ` for ${name}`
  if (kind === 'audit') return invocablePrompt('seo-audit', `Explain the saved audit ${id}${where}.`)
  const reportKind = row !== null && typeof row === 'object' && typeof row.kind === 'string' ? row.kind : ''
  return invocablePrompt(skillForReport(reportKind), `Explain the saved report ${id} (${title})${where}. Do not start a new run.`)
}
