import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--repo-url' || args[2] !== '--out') throw Error('Usage: market-index.mjs --repo-url <https url> --out <dir>');
const [, repoUrl, , out] = args;
const url = new URL(repoUrl);
if (url.protocol !== 'https:' || url.href !== repoUrl || url.username || url.password || url.search || url.hash || url.pathname.endsWith('/') || /\.(?:tgz|tar\.gz)$/.test(url.pathname) || url.pathname.split('/').filter(Boolean).length < 2) throw Error('Invalid canonical repository URL');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const tags = git('tag', '--list', 'v*').split('\n').filter((t) => /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(t));
const versions = [];
let metadata;
for (const tag of tags) {
  const commit = git('rev-list', '-n1', tag);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error(`Invalid commit for ${tag}`);
  const pkg = JSON.parse(git('show', `${commit}:package.json`));
  if (pkg.version !== tag.slice(1) || semver.valid(pkg.version) !== pkg.version) throw Error(`Tag/version mismatch: ${tag}`);
  if (!pkg.dsh?.bundle?.patch) throw Error(`Missing dsh.bundle in ${tag}`);
  if (typeof pkg.engines?.dsh !== 'string' || !pkg.engines.dsh.trim() || semver.validRange(pkg.engines.dsh) === null) throw Error(`Invalid engines.dsh in ${tag}`);
  if (typeof pkg.name !== 'string' || !/^@bisibility\/dsh-plugin$/.test(pkg.name)) throw Error(`Invalid package name in ${tag}`);
  const timestamp = Number(git('show', '-s', '--format=%ct', commit));
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp >= 1e11) throw Error(`Invalid timestamp in ${tag}`);
  const entry = { version: pkg.version, publishTimestamp: timestamp, source: { type: 'git', url: repoUrl, commit }, engines: { dsh: pkg.engines.dsh } };
  versions.push(entry);
  if (!metadata || semver.gt(pkg.version, metadata.pkg.version)) metadata = { pkg, commit };
}
const plugins = [];
if (metadata) {
  const { pkg, commit } = metadata;
  if (typeof pkg.description !== 'string' || !pkg.description.trim()) throw Error('Invalid description');
  const homepage = new URL(pkg.homepage);
  if (!['http:', 'https:'].includes(homepage.protocol)) throw Error('Invalid homepage');
  let zh;
  try { zh = JSON.parse(git('show', `${commit}:locale/zh.json`))?.meta?.title; } catch { /* optional locale */ }
  if (zh !== undefined && (typeof zh !== 'string' || !zh.trim())) throw Error('Invalid Chinese title');
  const title = { en: 'bisibility', ...(zh ? { zh } : {}) };
  plugins.push({ name: pkg.name, title, description: pkg.description, icon: 'icons/icon.png', author: 'CorgiCorner', homepage: pkg.homepage, repository: { url: repoUrl }, versions });
  const icon = execFileSync('git', ['show', `${commit}:icon.png`]);
  mkdirSync(join(out, 'icons'), { recursive: true });
  writeFileSync(join(out, 'icons', 'icon.png'), icon);
} else mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.json'), `${JSON.stringify({ format: 1, title: 'Bisibility plugins', plugins }, null, 2)}\n`);
