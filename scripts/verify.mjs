import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { translations } from '../src/client/locale.js';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
assert.ok(manifest.engines.dsh);
assert.equal(manifest.license, 'MIT');
assert.ok(manifest.version);
for (const path of ['index.js', 'client/client.js', 'icon.svg', 'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'README.md', 'LICENSE', 'CHANGELOG.md', '.github/workflows/ci.yml', '.github/workflows/release.yml']) await stat(path);
const changelog = await readFile('CHANGELOG.md', 'utf8');
assert.ok(changelog.includes(`## ${manifest.version}`), 'CHANGELOG.md must document the current version');
const readme = await readFile('README.md', 'utf8');
for (const topic of ['同一', '引用', 'MIT', '不撤销', 'Windows']) assert.ok(readme.includes(topic), `README.md is missing: ${topic}`);
for (const language of ['en', 'zh']) {
  const locale = JSON.parse(await readFile(`locale/${language}.json`, 'utf8'));
  assert.ok(locale.meta.title && locale.meta.description);
}
assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.zh).sort());
const icon = await readFile('icon.svg', 'utf8');
assert.ok(icon.startsWith('<svg') && icon.includes('</svg>') && Buffer.byteLength(icon) < 256 * 1024);
assert.ok(!/(?:<script|onload=|href=)/i.test(icon));
const scripts = ['index.js', ...(await readdir('src/host')).filter((path) => path.endsWith('.js')).map((path) => `src/host/${path}`), 'client/client.js'];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
let registration;
vm.runInNewContext(await readFile('client/client.js', 'utf8'), { window: { __ModuleLoader__: { load(value) { registration = value; } } } });
assert.equal(registration.id, manifest.name);
assert.equal(typeof registration.factory, 'function');
const react = { createElement() {}, useState() {}, useEffect() {}, useRef() {} };
const exported = registration.factory((id) => { if (id === 'react') return react; throw new Error(`unexpected require: ${id}`); });
assert.equal(typeof exported.apply, 'function');
assert.deepEqual([...exported.inject], ['slots', 'locale', 'remote', 'remote.commands']);
const hostSource = await readFile('index.js', 'utf8');
const serviceSource = await readFile('src/host/service.js', 'utf8');
const vaultSource = await readFile('src/host/vault.js', 'utf8');
for (const source of [hostSource, serviceSource, vaultSource]) {
  assert.ok(!/\bfetch\s*\(/.test(source), 'plugin must not make network requests');
  assert.ok(!/node:(?:http|https|net|tls)/.test(source), 'plugin must not open network modules');
}
const source = await readFile('src/client/index.jsx', 'utf8');
assert.ok(!source.includes('document.body'));
assert.ok(!source.includes('dangerouslySetInnerHTML'));
assert.ok(!source.includes('@deepseek-ai/dsh-client-ui-primitives'));
// Recovery must never create or switch conversations: the plugin sends in the session it was opened from.
assert.ok(!source.includes('uiWorkspace'));
assert.ok(!source.includes('openSession'));
assert.ok(!/openBranch|openOriginal/.test(source));
const host = await readFile('index.js', 'utf8');
assert.ok(!host.includes('sessionController.fork'));
assert.ok(!host.includes('ctx.agents.create'));
assert.ok(!/ctx\.sessions\.create\(/.test(host));
assert.ok(host.includes('src/host/http.js'));
const http = await readFile('src/host/http.js', 'utf8');
assert.ok(http.includes('/content-rollback') && http.includes('x-dcr-nonce'));
const service = await readFile('src/host/service.js', 'utf8');
assert.ok(!service.includes('childSessionId'));
assert.ok(!service.includes('fork'));
const transport = await readFile('src/client/transport.js', 'utf8');
assert.ok(transport.includes("x-dcr-nonce") && transport.includes('/call'));
console.log('Bundle manifest, locales, icon, runtime syntax, lazy module registration and same-session recovery contract verified.');
