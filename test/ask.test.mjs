import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askSuggestions, featuredStep, recentPrompt } from '../ask.js'

test('featured step is one next action', () => {
  assert.equal(featuredStep({ audit: false, searchConsole: true, keywords: true }).id, 'audit')
  assert.equal(featuredStep({ audit: true, searchConsole: false, keywords: true }).id, 'search-console')
  assert.deepEqual(featuredStep({ audit: true, searchConsole: true, keywords: false }), {
    id: 'keywords',
    skill: 'project-setup',
  })
  assert.deepEqual(featuredStep({ audit: true, searchConsole: true, keywords: true }), {
    id: 'weekly',
    skill: 'rank-tracking-report',
    then: 'competitor-analysis',
  })
})

test('ask suggestions stay at three and follow the data the project has', () => {
  assert.deepEqual(askSuggestions({}), [
    { id: 'audit', skill: 'seo-audit' },
    { id: 'compare', skill: 'competitor-analysis' },
    { id: 'mentions', skill: 'ai-visibility-audit' },
  ])
  assert.deepEqual(
    askSuggestions({ hasAudit: true, searchConsole: true, trafficHistory: false }).map((row) => row.id),
    ['issues', 'queries', 'compare'],
  )
  assert.deepEqual(
    askSuggestions({ hasAudit: true, searchConsole: true, trafficHistory: true }).map((row) => row.id),
    ['issues', 'queries', 'traffic'],
  )
  assert.equal(askSuggestions({ searchConsole: false }).some((row) => row.id === 'queries'), false)
  assert.equal(askSuggestions({ trafficHistory: false }).some((row) => row.id === 'traffic'), false)
})

test('recent prompts use the invocable skill form', () => {
  const audit = recentPrompt('audit', { id: 'agr_abcdefghijklmnopqrstuvwx', title: 'Crawl' }, 'example.com')
  assert.equal(audit.startsWith('/seo-audit '), true)
  const report = recentPrompt('report', { id: 'agr_bbbbbbbbbbbbbbbbbbbbbbbb', kind: 'ai_visibility', title: 'Mentions' }, 'example.com')
  assert.equal(report.startsWith('/ai-visibility-audit '), true)
  const other = recentPrompt('report', { id: 'agr_cccccccccccccccccccccccc', kind: 'external_analysis', title: 'Note' }, '')
  assert.equal(other.startsWith('/seo-audit '), true)
  assert.equal(other.includes('seo-coach'), false)
  const rival = recentPrompt('report', { id: 'agr_dddddddddddddddddddddddd', kind: 'competitor_analysis', title: 'Rival' }, 'example.com')
  assert.equal(rival.startsWith('/competitor-analysis '), true)
})
