import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSkillBundle } from '../scripts/check-skill-bundle.mjs'
import { syncSkills } from '../scripts/sync-skills.mjs'
import { shapeWorkflows } from '../workflows.js'
import {
  BUNDLED_SKILL_RANK,
  SKILL_PROVIDER_NAME,
  bundledSkillRecords,
  createBundledSkillProvider,
  defaultSkillsDir,
  readSkillManifest,
  registerBundledSkills,
  registrableSkillNames,
  shippedSkillNames,
} from '../skills.js'

const SOURCE_COMMIT = '6b9c571153b33fe35c66aaa586a261f5fc90af6c'

const ROOT = new URL('..', import.meta.url)

test('registration exposes the skills that are not withheld', async () => {
  const providers = []
  registerBundledSkills({
    skills: {
      registerProvider(create) {
        providers.push(create({ signal: new AbortController().signal, invalidate() {} }))
        return () => {}
      },
    },
  })
  assert.equal(providers.length, 1)
  assert.equal(providers[0].name, SKILL_PROVIDER_NAME)
  const listed = await providers[0].list()
  const shipped = shippedSkillNames()
  assert.equal(shipped.length, 19)
  assert.equal(shipped.includes('self-host-health'), false)
  assert.equal(shipped.includes('provider-setup'), true)
  assert.deepEqual(listed.map((skill) => skill.name).sort(), shipped)
  for (const skill of listed) {
    assert.equal(skill.description.trim().length > 0, true, skill.name)
    assert.equal(skill.rank, BUNDLED_SKILL_RANK, skill.name)
    assert.equal(skill.provider, SKILL_PROVIDER_NAME, skill.name)
    assert.equal(skill.invocation.userInvocable, true, skill.name)
    assert.equal(skill.invocation.modelInvocable, true, skill.name)
    assert.equal(skill.resourceBase.kind, 'directory', skill.name)
    const loaded = await providers[0].get(skill)
    assert.equal(loaded.name, skill.name)
    assert.equal(loaded.content.length > 0, true, skill.name)
    assert.equal(loaded.content.includes(`name: ${skill.name}`), true, skill.name)
    assert.equal(existsSync(join(skill.resourceBase.path, 'SKILL.md')), true, skill.name)
  }
  const competitor = listed.find((skill) => skill.name === 'competitor-analysis')
  assert.equal(competitor.description.startsWith('Analyze one competitor'), true)
  const directories = readdirSync(new URL('../skills', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.equal(directories.length, 20)
  assert.equal(directories.includes('self-host-health'), true)
  assert.deepEqual(directories.filter((name) => name !== 'self-host-health').sort(), shipped)
  const manifest = readSkillManifest()
  assert.equal(manifest.version, 2)
  assert.equal(manifest.commit, SOURCE_COMMIT)
  assert.equal(manifest.referenceForm, 'the `<slug>` skill')
  for (const rel of Object.keys(manifest.files)) {
    assert.equal(readFileSync(new URL(`../skills/${rel}`, import.meta.url), 'utf8').includes('/bisibility:'), false, rel)
  }
  const setup = bundledSkillRecords().find((skill) => skill.name === 'project-setup')
  const workflow = readFileSync(join(setup.dir, 'references/workflow.md'), 'utf8')
  assert.equal(workflow.includes('# Setup workflow'), true)
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.equal(host.includes('registerBundledSkills(ctx)'), true)
  assert.equal(host.includes("inject = ['webServer', 'skills']"), true)
})

test('self-host-health is not registered and nothing in the catalog names it', async () => {
  const registered = shippedSkillNames()
  assert.equal(registered.includes('self-host-health'), false)
  assert.equal(registered.includes('provider-setup'), true)
  const manifest = readSkillManifest()
  for (const [pack, info] of Object.entries(manifest.packs)) {
    if (pack === 'instance-diagnosis') continue
    for (const member of info.members) assert.equal(registered.includes(member), true, `${pack} ${member}`)
  }
  assert.equal(existsSync(new URL('../skills/self-host-health/SKILL.md', import.meta.url)), true)
  assertSkillBundle(fileURLToPath(new URL('..', import.meta.url)))
  const listed = await createBundledSkillProvider().list()
  assert.equal(listed.some((skill) => skill.name === 'self-host-health'), false)
  const catalog = [...shapeWorkflows('example.com', 'en'), ...shapeWorkflows('example.com', 'zh-CN')]
  assert.equal(catalog.some((row) => row.skill === 'self-host-health' || row.promptSkill === 'self-host-health'), false)
  assert.equal(catalog.some((row) => row.title === 'Instance check' || row.title === '实例检查'), false)
  assert.equal(catalog.some((row) => JSON.stringify(row).includes('self-host-health')), false)
  const planted = [...catalog, { skill: 'self-host-health', title: 'Instance check', prompt: '/self-host-health diagnose' }]
  assert.equal(planted.some((row) => row.skill === 'self-host-health'), true)
  assert.equal(catalog.some((row) => row.skill === 'self-host-health'), false)
  const opened = registrableSkillNames(defaultSkillsDir(), [])
  assert.equal(opened.includes('self-host-health'), true)
  assert.equal(shippedSkillNames().includes('self-host-health'), false)
})

test('skill bundle check fails on a one-byte change and passes after restore', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-drift-'))
  const file = join(root, 'skills/seo-coach/SKILL.md')
  try {
    cpSync(new URL('../skills', import.meta.url), join(root, 'skills'), { recursive: true })
    const original = readFileSync(file)
    writeFileSync(file, Buffer.concat([original, Buffer.from('x')]))
    assert.throws(() => assertSkillBundle(root), /seo-coach\/SKILL.md drifted from the recorded source hash/)
    writeFileSync(file, original)
    assertSkillBundle(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('skill bundle check rejects a symlink and passes after it is removed', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-link-'))
  const link = join(root, 'skills/seo-coach/extra.md')
  try {
    cpSync(new URL('../skills', import.meta.url), join(root, 'skills'), { recursive: true })
    symlinkSync(join(root, 'skills/seo-coach/SKILL.md'), link)
    assert.throws(() => assertSkillBundle(root), /seo-coach\/extra.md is a symlink/)
    rmSync(link)
    assertSkillBundle(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('removing one pack member drops that pack and every dependant, then restore', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-pack-'))
  const skillsDir = join(root, 'skills')
  const removed = join(skillsDir, 'domain-onboarding')
  try {
    cpSync(new URL('../skills', import.meta.url), skillsDir, { recursive: true })
    const before = registrableSkillNames(skillsDir)
    assert.deepEqual(before, shippedSkillNames())
    rmSync(removed, { recursive: true, force: true })
    const dropped = registrableSkillNames(skillsDir)
    for (const name of ['domain-onboarding', 'keyword-import', 'bisibility', 'seo-coach']) {
      assert.equal(dropped.includes(name), false, name)
    }
    assert.equal(dropped.includes('provider-setup'), true)
    assert.equal(dropped.includes('self-host-health'), false)
    assert.equal(dropped.length, before.length - 4)
    const listed = await createBundledSkillProvider(skillsDir).list()
    assert.deepEqual(listed.map((skill) => skill.name).sort(), dropped)
    cpSync(new URL('../skills/domain-onboarding', import.meta.url), removed, { recursive: true })
    assert.deepEqual(registrableSkillNames(skillsDir), before)
    assert.equal((await createBundledSkillProvider(skillsDir).list()).length, before.length)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a planted unknown requires fails the bundle check, then restore', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-requires-'))
  const manifestPath = join(root, 'skills/source.json')
  try {
    cpSync(new URL('../skills', import.meta.url), join(root, 'skills'), { recursive: true })
    const original = readFileSync(manifestPath)
    const manifest = JSON.parse(original)
    manifest.skills['provider-setup'].requires = ['not-a-skill']
    writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.throws(() => assertSkillBundle(root), /provider-setup requires not-a-skill, which is no skill/)
    writeFileSync(manifestPath, original)
    assertSkillBundle(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a bad skill source leaves the existing skills directory in place', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-skill-sync-'))
  const skillsDir = join(root, 'skills')
  const source = join(root, 'bad.json')
  try {
    mkdirSync(skillsDir)
    writeFileSync(join(skillsDir, 'keep.txt'), 'keep')
    writeFileSync(source, JSON.stringify({ only: [] }))
    assert.throws(() => syncSkills(source, skillsDir, SOURCE_COMMIT), /skill source is not bundle v2/)
    assert.equal(readFileSync(join(skillsDir, 'keep.txt'), 'utf8'), 'keep')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bundle metadata records the source commit', () => {
  const manifest = JSON.parse(readFileSync(new URL('../skills/source.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, 2)
  assert.equal(manifest.algorithm, 'sha256')
  assert.equal(manifest.commit, SOURCE_COMMIT)
  assert.equal(manifest.referenceForm, 'the `<slug>` skill')
  assert.equal(Object.keys(manifest.skills).length, 20)
  assert.equal(Object.keys(manifest.files).some((file) => file.endsWith('/SKILL.md')), true)
  assert.equal(manifest.packs.router.members.includes('seo-coach'), true)
  assert.equal(manifest.packs['project-onboarding'].members.includes('keyword-import'), true)
  assert.equal(manifest.packs['instance-diagnosis'].members.includes('self-host-health'), true)
  assert.equal(manifest.skills['provider-setup'].pack, null)
  const configured = process.env.BISIBILITY_PLUGIN_SKILLS
  if (typeof configured !== 'string' || configured.trim() === '') return
  const source = readFileSync(configured.trim())
  assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'))
  const generated = JSON.parse(source.toString('utf8'))
  assert.equal(generated.version, 2)
  assert.deepEqual(Object.keys(generated.skills).sort(), Object.keys(manifest.skills).sort())
})
