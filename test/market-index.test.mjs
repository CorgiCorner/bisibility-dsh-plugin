import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const generator = resolve('scripts/market-index.mjs');
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-market-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
    mkdirSync(join(root, 'locale'));
    writeFileSync(join(root, 'locale/zh.json'), JSON.stringify({ meta: { title: 'Bisibility' } }));
    writeFileSync(join(root, 'icon.png'), 'icon');
    const commit = (version, tag, bundle = true) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@bisibility/dsh-plugin', version, description: 'Example', homepage: 'https://example.com', engines: { dsh: '>=0.2.1-rc.5 <0.3.0' }, ...(bundle ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}) }));
      git('add', '.'); git('commit', '-qm', version); git('tag', tag);
    };
    const run = () => spawnSync(process.execPath, [generator, '--repo-url', 'https://example.com/owner/repo', '--out', join(root, 'out')], { cwd: root, encoding: 'utf8' });
    fn({ root, git, commit, run });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('market index contains tagged public commits', () => fixture(({ root, git, commit, run }) => {
  commit('0.1.0', 'v0.1.0'); commit('0.2.0', 'v0.2.0');
  const result = run(); assert.equal(result.status, 0, result.stderr);
  const index = JSON.parse(readFileSync(join(root, 'out/index.json')));
  assert.equal(index.format, 1); assert.equal(index.plugins[0].versions.length, 2);
  assert.equal(index.plugins[0].versions[1].source.commit, git('rev-list', '-n1', 'v0.2.0'));
  assert.equal(index.plugins[0].versions[0].engines.dsh, '>=0.2.1-rc.5 <0.3.0');
}));
test('market index rejects mismatched tag', () => fixture(({ commit, run }) => { commit('0.1.0', 'v0.2.0'); assert.notEqual(run().status, 0); }));
test('market index rejects missing bundle', () => fixture(({ commit, run }) => { commit('0.1.0', 'v0.1.0', false); assert.notEqual(run().status, 0); }));
