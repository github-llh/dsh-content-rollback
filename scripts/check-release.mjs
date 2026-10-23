import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const tag = process.env.GITHUB_REF_NAME ?? '';

assert.match(tag, /^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'GITHUB_REF_NAME must be a release tag such as v0.2.0');
assert.equal(tag, `v${manifest.version}`, `tag ${tag} does not match package version ${manifest.version}`);
assert.ok(changelog.includes(`## ${manifest.version}`), `CHANGELOG.md has no entry for ${manifest.version}`);
assert.equal(manifest.license, 'MIT');
console.log(`Release ${tag} matches package version ${manifest.version}.`);
