import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['src/client/index.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'browser', target: ['chrome120'],
  external: ['react'], legalComments: 'none',
});
await mkdir('client', { recursive: true });
await writeFile('client/client.js', `window.__ModuleLoader__.load({id:'dsh-content-rollback',factory(require){const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`);
