#!/usr/bin/env node
/**
 * Fail when skills/ no longer matches the bundle v2 metadata recorded at sync time.
 * Node built-ins only.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILL_NAME } from '../skills.js'

const COMMIT = /^[a-f0-9]{40}$/
const SKILL_PACK_IDS = ['router', 'project-onboarding', 'instance-diagnosis']
const SKILL_REFERENCE_FORM = 'the `<slug>` skill'

/**
 * Hash of one file's bytes.
 * @param path - absolute file path.
 * @returns sha256 hex.
 */
function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * Every file under skills/ except the manifest, as forward-slash paths.
 * @param skillsDir - absolute skills directory.
 * @returns path to sha256.
 */
function bundledHashes(skillsDir) {
  /** @type {Record<string, string>} */
  const hashes = {}
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const rel = relative(skillsDir, path).split('\\').join('/')
      if (entry.isSymbolicLink()) throw new Error(`skill bundle ${rel} is a symlink`)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) hashes[rel] = fileHash(path)
      else throw new Error(`skill bundle ${rel} is not a regular file`)
    }
  }
  walk(skillsDir)
  delete hashes['source.json']
  return hashes
}

/**
 * Recorded pack, requires, and source commit must match the files on disk.
 * @param manifest - skills/source.json.
 * @param skillsDir - absolute skills directory.
 */
function assertBundleMetadata(manifest, skillsDir) {
  if (manifest?.version !== 2) throw new Error('skill bundle version is not 2')
  if (manifest.referenceForm !== SKILL_REFERENCE_FORM) throw new Error('skill reference form is wrong')
  if (manifest.algorithm !== 'sha256' || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error('skill source hash is missing')
  }
  if (typeof manifest.commit !== 'string' || !COMMIT.test(manifest.commit)) throw new Error('skill source commit is missing')
  const skills = manifest.skills
  if (skills === null || typeof skills !== 'object' || Array.isArray(skills)) throw new Error('skill bundle has no skills')
  const names = Object.keys(skills)
  if (names.length !== 20) throw new Error(`expected 20 skills, found ${names.length}`)
  const known = new Set(names)
  for (const name of names) {
    const skill = skills[name]
    if (skill === null || typeof skill !== 'object') throw new Error(`${name} is not a skill record`)
    if (skill.pack !== null && !SKILL_PACK_IDS.includes(skill.pack)) throw new Error(`skill bundle ${name} has pack ${skill.pack}`)
    if (!Array.isArray(skill.requires)) throw new Error(`skill bundle ${name} requires are missing`)
    for (const req of skill.requires) {
      if (typeof req !== 'string' || !SKILL_NAME.test(req) || req === name || !known.has(req)) {
        throw new Error(`skill bundle ${name} requires ${req}, which is no skill`)
      }
    }
    const info = lstatSync(join(skillsDir, name), { throwIfNoEntry: false })
    if (info !== undefined && info.isSymbolicLink()) throw new Error(`skill bundle ${name} is a symlink`)
    if (info === undefined || !info.isDirectory()) throw new Error(`skill bundle ${name} drifted from the recorded source hash ${manifest.sha256} at ${manifest.commit}`)
  }
  if (manifest.packs === null || typeof manifest.packs !== 'object' || Array.isArray(manifest.packs)) {
    throw new Error('skill packs are missing')
  }
  for (const id of SKILL_PACK_IDS) {
    const pack = manifest.packs[id]
    if (pack === null || typeof pack !== 'object' || !Array.isArray(pack.members) || !Array.isArray(pack.requires)) {
      throw new Error(`pack ${id} is missing`)
    }
    const members = names.filter((name) => skills[name].pack === id).sort()
    if (members.join('\n') !== [...pack.members].sort().join('\n')) throw new Error(`pack ${id} members drifted from the recorded source ${manifest.commit}`)
    for (const req of pack.requires) {
      if (!known.has(req) || members.includes(req)) throw new Error(`pack ${id} requires ${req}, which is no skill`)
    }
  }
}

/**
 * Throw when the bundled copy drifts from skills/source.json.
 * @param root - plugin root, as a path or file URL.
 */
export function assertSkillBundle(root) {
  const base = typeof root === 'string' ? resolve(root) : fileURLToPath(root)
  const skillsDir = join(base, 'skills')
  const manifest = JSON.parse(readFileSync(join(skillsDir, 'source.json'), 'utf8'))
  assertBundleMetadata(manifest, skillsDir)
  const expected = manifest.files
  if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('skill file hashes are missing')
  }
  const actual = bundledHashes(skillsDir)
  const expectedKeys = Object.keys(expected).sort()
  const actualKeys = Object.keys(actual).sort()
  if (expectedKeys.length === 0) throw new Error('skill bundle is empty')
  for (const key of expectedKeys) {
    const info = lstatSync(join(skillsDir, ...key.split('/')), { throwIfNoEntry: false })
    if (info !== undefined && info.isSymbolicLink()) throw new Error(`skill bundle ${key} is a symlink`)
    if (info === undefined || !info.isFile()) {
      throw new Error(`skill bundle ${key} drifted from the recorded source hash ${manifest.sha256} at ${manifest.commit}`)
    }
    if (actual[key] !== expected[key]) {
      throw new Error(`skill bundle ${key} drifted from the recorded source hash ${manifest.sha256} at ${manifest.commit}`)
    }
  }
  for (const key of actualKeys) {
    if (expected[key] === undefined) {
      throw new Error(`skill bundle ${key} drifted from the recorded source hash ${manifest.sha256} at ${manifest.commit}`)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  assertSkillBundle(root)
  const manifest = JSON.parse(readFileSync(join(root, 'skills', 'source.json'), 'utf8'))
  console.log(`Skill bundle matches the recorded source ${manifest.commit}.`)
}
