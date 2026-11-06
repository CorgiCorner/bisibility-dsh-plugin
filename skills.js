import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bundled Bisibility skills.
 *
 * DSH invokes a skill by its plain kebab-case name (`/seo-audit`), never by a
 * `bisibility:` prefix. Rank 600 is the packaged-skill rank from
 * `dsh-skill` (`BUNDLED_SKILL_RANK`). This plugin has no runtime dependency,
 * so the number is hardcoded. Host registration lands in the global layer.
 */

/** Public skill-name grammar from `dsh-skill`. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whitespace-bounded `/name` gesture from `dsh-tool-skill`.
 * A colon, as in `/bisibility:seo-audit`, does not match.
 */
export const SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/

/** Packaged skill rank. Lower ranks (project, user) win inside one layer. */
export const BUNDLED_SKILL_RANK = 600

/**
 * Packs this plugin does not register.
 * Their files stay in skills/ and the bundle drift check still covers them.
 * Remove an entry to register that pack again.
 */
export const UNREGISTERED_SKILL_PACKS = [
  // self-hosted instances are not supported by the plugin yet
  'instance-diagnosis',
]

const SKILLS_URL = new URL('./skills/', import.meta.url)
const SOURCE_COMMIT = /^[a-f0-9]{40}$/

/**
 * Absolute skills directory shipped with this plugin.
 * @returns the skills path.
 */
export function defaultSkillsDir() {
  return fileURLToPath(SKILLS_URL)
}

/**
 * Read the bundle v2 manifest written at sync time.
 * @param skillsDir - directory that contains source.json.
 * @returns the manifest object.
 */
export function readSkillManifest(skillsDir = defaultSkillsDir()) {
  const manifest = JSON.parse(readFileSync(join(skillsDir, 'source.json'), 'utf8'))
  if (manifest === null || typeof manifest !== 'object' || manifest.version !== 2) throw new Error('skill bundle version is not 2')
  if (typeof manifest.commit !== 'string' || !SOURCE_COMMIT.test(manifest.commit)) throw new Error('skill source commit is missing')
  if (manifest.skills === null || typeof manifest.skills !== 'object' || Array.isArray(manifest.skills)) {
    throw new Error('skill bundle has no skills')
  }
  return manifest
}

/**
 * Pack id for one bundled skill, or null when the skill sits outside every pack.
 * @param name - skill slug.
 * @param skillsDir - directory that contains source.json.
 * @returns the pack id or null.
 */
export function skillPack(name, skillsDir = defaultSkillsDir()) {
  const skill = readSkillManifest(skillsDir).skills[name]
  if (skill === undefined) throw new Error(`unknown skill ${name}`)
  return skill.pack ?? null
}

/**
 * Skills that can ship from this directory.
 * A pack ships only when every member is present. A skill ships only when every
 * skill it requires also ships. Dropping one member drops the pack and every
 * skill whose requires closure included that member.
 * A pack listed in `unregisteredPacks` is withheld on purpose. That absence does
 * not drop skills that require it, and it does not drop the other packs.
 * @param skillsDir - directory that contains source.json and one folder per skill.
 * @param unregisteredPacks - pack ids to leave unregistered. Defaults to the plugin config.
 * @returns sorted slugs.
 */
export function registrableSkillNames(skillsDir = defaultSkillsDir(), unregisteredPacks = UNREGISTERED_SKILL_PACKS) {
  const manifest = readSkillManifest(skillsDir)
  const meta = manifest.skills
  const present = new Set(
    readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name),
  )
  const withheldPacks = new Set(Array.isArray(unregisteredPacks) ? unregisteredPacks : [])
  const membersOf = (pack) => Object.entries(meta).filter(([, skill]) => skill.pack === pack).map(([slug]) => slug)
  const active = new Set(Object.keys(meta).filter((slug) => present.has(slug)))
  const withheld = new Set()
  for (const slug of [...active]) {
    const pack = meta[slug]?.pack
    if (typeof pack === 'string' && withheldPacks.has(pack)) {
      active.delete(slug)
      withheld.add(slug)
    }
  }
  let changed = true
  while (changed) {
    changed = false
    for (const slug of [...active]) {
      const skill = meta[slug]
      const requires = Array.isArray(skill?.requires) ? skill.requires : []
      const packMembers = typeof skill?.pack === 'string' ? membersOf(skill.pack) : []
      const packComplete = packMembers.every((member) => active.has(member))
      const requiresMet = requires.every((req) => active.has(req) || withheld.has(req))
      if (!packComplete || !requiresMet) {
        active.delete(slug)
        changed = true
      }
    }
  }
  return [...active].sort()
}

/**
 * Skills this plugin registers and prefills from the shipped tree.
 * The workflow catalog uses this same list.
 * @returns sorted slugs.
 */
export function shippedSkillNames() {
  return registrableSkillNames()
}

/** Provider name registered on `ctx.skills`. `runtime` is reserved. */
export const SKILL_PROVIDER_NAME = 'bisibility'

/**
 * The name a composer token must use for this skill.
 * @param name - kebab-case skill name.
 * @param text - optional words after the token.
 * @returns a prompt whose first token is `/name`.
 */
export function invocablePrompt(name, text) {
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) throw new Error(`invalid skill name "${name}"`)
  const body = typeof text === 'string' ? text.trim() : ''
  return body === '' ? `/${name}` : `/${name} ${body}`
}

/**
 * Read `name` and `description` from a SKILL.md document.
 * Descriptions are a single line. A quoted line is JSON, which covers the
 * one description that contains colons.
 * @param content - the SKILL.md text.
 * @param label - path used in errors.
 * @returns the frontmatter fields this bundle reads.
 */
export function parseSkillFrontmatter(content, label) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content)
  if (match === null) throw new Error(`${label} is missing frontmatter`)
  /** @type {Record<string, string>} */
  const fields = {}
  for (const line of match[1].split('\n')) {
    if (line.trim() === '') continue
    const cut = line.indexOf(':')
    if (cut <= 0) throw new Error(`${label} has a bad frontmatter line`)
    const key = line.slice(0, cut).trim()
    let value = line.slice(cut + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value)
    fields[key] = value
  }
  if (!SKILL_NAME.test(fields.name ?? '')) throw new Error(`${label} has an invalid skill name`)
  if (typeof fields.description !== 'string' || fields.description.trim() === '') {
    throw new Error(`${label} has no description`)
  }
  return { name: fields.name, description: fields.description }
}

/**
 * One bundled skill and the directory the model resolves relative paths against.
 * Only a complete pack with a satisfied requires closure is included.
 * @param skillsDir - skills directory. Defaults to the shipped tree.
 * @returns records sorted by name.
 */
export function bundledSkillRecords(skillsDir = defaultSkillsDir()) {
  const names = registrableSkillNames(skillsDir)
  return names.map((name) => {
    const dir = join(skillsDir, name)
    const skillPath = join(dir, 'SKILL.md')
    const content = readFileSync(skillPath, 'utf8')
    const fields = parseSkillFrontmatter(content, `${name}/SKILL.md`)
    if (fields.name !== name) throw new Error(`${name}/SKILL.md is named ${fields.name}`)
    return { name, description: fields.description, content, dir, skillPath }
  })
}

/**
 * The provider object `ctx.skills.registerProvider` stores.
 * Resource files stay on disk. `get` returns the SKILL.md bytes verbatim.
 * @param skillsDir - skills directory. Defaults to the shipped tree.
 * @returns a skill provider.
 */
export function createBundledSkillProvider(skillsDir = defaultSkillsDir()) {
  const candidateFor = (record) => ({
    name: record.name,
    description: record.description,
    invocation: { modelInvocable: true, userInvocable: true },
    provider: SKILL_PROVIDER_NAME,
    source: 'bundled',
    resourceBase: { kind: 'directory', path: record.dir },
    rank: BUNDLED_SKILL_RANK,
    path: record.skillPath,
    locator: record.name,
  })
  return {
    name: SKILL_PROVIDER_NAME,
    list() {
      return Promise.resolve(bundledSkillRecords(skillsDir).map(candidateFor))
    },
    async get(candidate) {
      const name = candidate !== null && typeof candidate === 'object' ? candidate.locator ?? candidate.name : undefined
      const record = bundledSkillRecords(skillsDir).find((item) => item.name === name)
      if (record === undefined) throw new Error(`skill "${name}" is not bundled`)
      return {
        name: record.name,
        description: record.description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: SKILL_PROVIDER_NAME,
        source: 'bundled',
        resourceBase: { kind: 'directory', path: record.dir },
        path: record.skillPath,
        content: record.content,
      }
    },
  }
}

/**
 * Register the bundled provider on the host context.
 * A test double with no `skills` service skips this. The host row is unscoped,
 * so the registry files these skills in the global layer.
 * @param ctx - the host plugin context.
 */
export function registerBundledSkills(ctx) {
  const skills = ctx !== null && typeof ctx === 'object' ? ctx.skills : undefined
  if (skills === undefined || skills === null || typeof skills.registerProvider !== 'function') return
  skills.registerProvider(() => createBundledSkillProvider())
}
