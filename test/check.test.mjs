import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = resolve('.');
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-check-'));
  try {
    for (const path of ['scripts/check.mjs', 'scripts/check-skill-bundle.mjs', 'locale', 'index.js', 'client.js', 'workflows.js', 'skills.js', 'ask.js', 'skills', 'package.json', 'cordis.patch.yml', 'README.md']) cpSync(join(source, path), join(root, path), { recursive: true });
    symlinkSync(join(source, 'node_modules'), join(root, 'node_modules'));
    const run = () => spawnSync(process.execPath, [join(root, 'scripts/check.mjs')], { encoding: 'utf8' });
    fn(root, run);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('check accepts the plugin', () => fixture((root, run) => assert.equal(run().status, 0)));
test('check rejects invalid JavaScript', () => fixture((root, run) => { writeFileSync(join(root, 'client.js'), 'const = ;'); assert.notEqual(run().status, 0); }));
test('check rejects locale mismatch', () => fixture((root, run) => { writeFileSync(join(root, 'locale/zh.json'), '{}'); assert.notEqual(run().status, 0); }));
test('check rejects client locale mismatch', () => fixture((root, run) => { const p = join(root, 'client.js'); writeFileSync(p, readFileSync(p, 'utf8').replace("'update.required': '需要更新',", '')); assert.notEqual(run().status, 0); }));
test('check rejects wrong patch name', () => fixture((root, run) => { const p = join(root, 'cordis.patch.yml'); writeFileSync(p, readFileSync(p, 'utf8').replace('@bisibility/dsh-plugin', '@example/wrong')); assert.notEqual(run().status, 0); }));
test('check rejects a stale client module id', () => fixture((root, run) => { const p = join(root, 'client.js'); writeFileSync(p, readFileSync(p, 'utf8').replace("id: '@bisibility/dsh-plugin'", "id: '@local/bisibility'")); assert.notEqual(run().status, 0); }));
test('check rejects a README pinned to another version', () => fixture((root, run) => { const p = join(root, 'README.md'); writeFileSync(p, readFileSync(p, 'utf8').replace(/\.git#v\d+\.\d+\.\d+/, '.git#v0.0.1')); assert.notEqual(run().status, 0); }));
test('check rejects invalid DSH range', () => fixture((root, run) => { const p = join(root, 'package.json'); const pkg = JSON.parse(readFileSync(p)); pkg.engines.dsh = 'invalid'; writeFileSync(p, JSON.stringify(pkg)); assert.notEqual(run().status, 0); }));

test('cordis patch mounts one skill loader in the named bisibility preset', () => {
  const patch = readFileSync(join(source, 'cordis.patch.yml'), 'utf8');
  const preset = patch.match(/^    - id: preset-bisibility\n(?:(?!^    - id:)[\s\S])*/m)?.[0];
  assert.ok(preset, 'the existing preset role id is preserved');
  assert.match(preset, /^      name: '@deepseek-ai\/dsh-agent-preset'$/m);
  assert.match(preset, /^      config:\n        id: bisibility\n        name: bisibility\n/m);
  // Same row shape as dsh-web-app/presets/standard.patch.yml:39-40, no config.
  const composition = [
    '        plugins:',
    '          - id: tool-skill',
    "            name: '@deepseek-ai/dsh-tool-skill'",
    '',
  ].join('\n');
  assert.equal(preset.slice(preset.indexOf('        plugins:')), composition);
  assert.equal([...patch.matchAll(/name: ['"]?@deepseek-ai\/dsh-tool-skill['"]?/g)].length, 1, 'no second or host-level loader');
});
