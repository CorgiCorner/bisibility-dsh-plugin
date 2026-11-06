#!/usr/bin/env node
/**
 * Regenerate skills/ from a bundle v2 plugin skill file.
 *
 * Usage: node scripts/sync-skills.mjs <plugin-skill-files.generated.json> <commit>
 * Node built-ins only. The source path is not written into the bundle.
 * The commit is the bisibility-private SHA the file was exported from.
 * File bytes are stored as published. Cross-references are already harness-neutral.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillFrontmatter, SKILL_NAME } from '../skills.js'

/** Pack ids published with bundle v2. A skill belongs to at most one. */
export const SKILL_PACK_IDS = ['router', 'project-onboarding', 'instance-diagnosis']

/** Prose form of a cross-reference. The same bytes ship for every harness. */
export const SKILL_REFERENCE_FORM = 'the `<slug>` skill'

const COMMIT = /^[a-f0-9]{40}$/

/**
 * Replace one skills directory from a bundle v2 object.
 * The source is validated before anything in the destination is removed.
 * Files land in a temporary directory, then that directory replaces the destination.
 * @param sourcePath - plugin-skill-files.generated.json.
 * @param skillsDir - directory to replace.
 * @param commit - 40-character source commit.
 */
export function syncSkills(sourcePath, skillsDir, commit) {
  if (typeof commit !== 'string' || !COMMIT.test(commit)) throw new Error('skill source commit is missing')
  const sourceBytes = readFileSync(sourcePath)
  const parsed = JSON.parse(sourceBytes.toString('utf8'))
  const names = validateBundle(parsed)

  /** @type {{ rel: string, bytes: Buffer }[]} */
  const planned = []
  for (const name of names) {
    const skill = parsed.skills[name]
    const entries = skill.files
    for (const entry of entries) {
      if (entry === null || typeof entry !== 'object') throw new Error(`${name} has a bad file entry`)
      const rel = safeRelative(name, entry.path)
      if (typeof entry.content !== 'string') throw new Error(`${rel} has no content`)
      planned.push({ rel, bytes: Buffer.from(entry.content, 'utf8') })
    }
  }

  const staging = mkdtempSync(join(tmpdir(), 'dsh-skills-'))
  /** @type {Record<string, string>} */
  const files = {}
  try {
    for (const item of planned) {
      const dest = join(staging, ...item.rel.split('/'))
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, item.bytes)
      files[item.rel] = createHash('sha256').update(item.bytes).digest('hex')
    }
    /** @type {Record<string, { pack: string | null, requires: string[] }>} */
    const skills = {}
    for (const name of names) {
      skills[name] = { pack: parsed.skills[name].pack, requires: [...parsed.skills[name].requires] }
    }
    /** @type {Record<string, { members: string[], requires: string[] }>} */
    const packs = {}
    for (const id of SKILL_PACK_IDS) {
      packs[id] = {
        members: [...parsed.packs[id].members],
        requires: [...parsed.packs[id].requires],
      }
    }
    const manifest = {
      version: 2,
      algorithm: 'sha256',
      source: 'plugin-skill-files.generated.json',
      commit,
      referenceForm: parsed.referenceForm,
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
      packs,
      skills,
      files,
    }
    writeFileSync(join(staging, 'source.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }

  mkdirSync(dirname(skillsDir), { recursive: true })
  const backup = `${skillsDir}.bak-${randomBytes(4).toString('hex')}`
  let moved = false
  try {
    if (existsSync(skillsDir)) {
      renameSync(skillsDir, backup)
      moved = true
    }
    renameSync(staging, skillsDir)
  } catch (error) {
    if (moved && existsSync(backup)) renameSync(backup, skillsDir)
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
  if (moved) rmSync(backup, { recursive: true, force: true })
}

/**
 * Reject a bundle that is not version 2 or whose packs and requires disagree.
 * @param parsed - decoded JSON.
 * @returns sorted skill slugs.
 */
function validateBundle(parsed) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('skill source is not an object')
  }
  if (parsed.version !== 2 || parsed.referenceForm !== SKILL_REFERENCE_FORM) {
    throw new Error('skill source is not bundle v2')
  }
  const skills = parsed.skills
  if (skills === null || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new Error('expected 20 skills, found 0')
  }
  const names = Object.keys(skills).sort()
  if (names.length !== 20) throw new Error(`expected 20 skills, found ${names.length}`)
  const known = new Set(names)
  for (const name of names) {
    const skill = skills[name]
    if (skill === null || typeof skill !== 'object' || Array.isArray(skill)) throw new Error(`${name} is not a skill record`)
    if (skill.pack !== null && !SKILL_PACK_IDS.includes(skill.pack)) throw new Error(`${name} has pack ${skill.pack}`)
    if (!Array.isArray(skill.requires)) throw new Error(`${name} requires are missing`)
    for (const req of skill.requires) {
      if (typeof req !== 'string' || !SKILL_NAME.test(req) || req === name || !known.has(req)) {
        throw new Error(`${name} requires ${req}, which is no skill`)
      }
    }
    if (!Array.isArray(skill.files) || skill.files.length === 0) throw new Error(`${name} has no files`)
    const skillFile = skill.files.find((entry) => entry !== null && typeof entry === 'object' && entry.path === 'SKILL.md')
    if (skillFile === undefined || typeof skillFile.content !== 'string' || skillFile.content.length === 0) {
      throw new Error(`${name} is missing SKILL.md`)
    }
    const fields = parseSkillFrontmatter(skillFile.content, `${name}/SKILL.md`)
    if (fields.name !== name) throw new Error(`${name} frontmatter is named ${fields.name}`)
  }
  if (parsed.packs === null || typeof parsed.packs !== 'object' || Array.isArray(parsed.packs)) {
    throw new Error('skill packs are missing')
  }
  for (const id of SKILL_PACK_IDS) {
    const pack = parsed.packs[id]
    if (pack === null || typeof pack !== 'object' || !Array.isArray(pack.members) || !Array.isArray(pack.requires)) {
      throw new Error(`pack ${id} is missing`)
    }
    const members = names.filter((name) => skills[name].pack === id).sort()
    const declaredMembers = [...pack.members].sort()
    if (members.join('\n') !== declaredMembers.join('\n')) throw new Error(`pack ${id} members do not match`)
    const external = new Set(
      members.flatMap((name) => skills[name].requires).filter((req) => !members.includes(req)),
    )
    const declaredRequires = [...pack.requires].sort()
    if ([...external].sort().join('\n') !== declaredRequires.join('\n')) throw new Error(`pack ${id} requires do not match`)
  }
  return names
}

/**
 * Join a skill name and a source path, rejecting escape from that skill.
 * @param name - skill directory name.
 * @param filePath - path inside the skill.
 * @returns a forward-slash path relative to skills/.
 */
function safeRelative(name, filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') throw new Error(`${name} has an empty path`)
  const rel = filePath.replaceAll('\\', '/')
  if (rel.startsWith('/') || rel.split('/').includes('..') || rel.split('/').includes('.')) {
    throw new Error(`${name} has an unsafe path ${filePath}`)
  }
  return `${name}/${rel}`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourcePath = process.argv[2]
  const commit = process.argv[3]
  if (typeof sourcePath !== 'string' || sourcePath.trim() === '' || typeof commit !== 'string' || commit.trim() === '') {
    console.error('Usage: node scripts/sync-skills.mjs <plugin-skill-files.generated.json> <commit>')
    process.exit(1)
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  syncSkills(sourcePath, join(root, 'skills'), commit)
  const manifest = JSON.parse(readFileSync(join(root, 'skills', 'source.json'), 'utf8'))
  console.log(`Wrote 20 skills from ${manifest.commit}, source ${manifest.sha256}.`)
}
