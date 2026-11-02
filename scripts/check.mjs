import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import semver from 'semver';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) => {
  const name = prefix ? `${prefix}.${key}` : key;
  return item && typeof item === 'object' && !Array.isArray(item) ? keys(item, name) : [name];
}).sort();
for (const file of ['index.js', 'client.js']) execFileSync(process.execPath, ['--check', new URL(`../${file}`, import.meta.url).pathname], { stdio: 'inherit' });
if (JSON.stringify(keys(JSON.parse(read('locale/en.json')))) !== JSON.stringify(keys(JSON.parse(read('locale/zh.json'))))) throw Error('Locale keys differ');
const dictionary = (name) => {
  const block = read('client.js').match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\s*\\};`));
  if (!block) throw Error(`client.js has no ${name} dictionary`);
  return [...block[1].matchAll(/^\s*'?([\w.]+)'?:/gm)].map((match) => match[1]).sort();
};
if (JSON.stringify(dictionary('en')) !== JSON.stringify(dictionary('zh'))) throw Error('Client locale keys differ');
const pkg = JSON.parse(read('package.json'));
const row = read('cordis.patch.yml').match(/- id:\s*bisibility\s*\n\s*name:\s*['"]?([^'"\s]+)['"]?/);
if (!row || row[1] !== pkg.name) throw Error('Plugin row does not match package name');
const client = read('client.js').match(/__ModuleLoader__\.load\(\{\s*id:\s*['"]([^'"]+)['"]/);
if (!client || client[1] !== pkg.name) throw Error('Client module id does not match package name');
const pinned = [...read('README.md').matchAll(/bisibility-dsh-plugin\.git#v(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
if (pinned.length === 0 || pinned.some((value) => value !== pkg.version)) throw Error(`README install commands must pin v${pkg.version}`);
if (typeof pkg.engines?.dsh !== 'string' || !pkg.engines.dsh.trim() || semver.validRange(pkg.engines.dsh) === null) throw Error('Invalid engines.dsh');
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 2 || args[0] !== '--host') throw Error('Usage: node scripts/check.mjs [--host <base-url>]');
  const base = new URL(args[1]);
  const request = async (path, options, expected) => {
    const response = await fetch(new URL(path, base), options);
    if (response.status !== expected) throw Error(`${path}: expected ${expected}, got ${response.status}`);
  };
  await request('/bisibility/oauth/status', {}, 401);
  await request('/bisibility/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'check', version: '1.0.0' } } }) }, 200);
  await request('/bisibility/mcp', { method: 'POST', headers: { origin: 'https://example.com' } }, 403);
}
console.log('Plugin checks passed.');
