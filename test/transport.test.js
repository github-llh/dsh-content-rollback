import test from 'node:test';
import assert from 'node:assert/strict';
import { callRecovery, DraftWriter } from '../src/client/transport.js';
const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; };
test('transport binds to the captured session instead of a mutable active session', async () => {
  let received;
  const remote = { commands: { async execute(...args) { received = args; return { ok: true, value: { result: { kind: 'success', text: '{"ok":true,"value":{"saved":true}}' } } }; } } };
  assert.deepEqual(await callRecovery(remote, 'session-A', { action: 'list' }), { saved: true });
  assert.equal(received[0], 'session-A');
  assert.deepEqual(received[2], []);
});
test('transport distinguishes disconnect, unknown command, and domain error', async () => {
  for (const [response, code] of [[{ ok: false }, 'DISCONNECTED'], [{ ok: true }, 'UNAVAILABLE'], [{ ok: true, value: { result: { kind: 'success', text: '{"ok":false,"error":{"code":"FORBIDDEN","message":"denied"}}' } } }, 'FORBIDDEN']]) {
    await assert.rejects(callRecovery({ commands: { execute: async () => response } }, 's', {}), { code });
  }
});
test('draft writes are serialized and preserve last keystrokes across failures', async () => {
  const local = storage();
  const revisions = [];
  const writer = new DraftWriter('token', 0, async (request) => {
    revisions.push(request.revision);
    return { revision: request.revision + 1 };
  }, local);
  await Promise.all([writer.save(['一']), writer.save(['二']), writer.save(['三'])]);
  assert.deepEqual(revisions, [0]);
  assert.equal(local.getItem('dsh-rollback:token'), null);
  const offline = new DraftWriter('offline', 0, async () => { throw new Error('offline'); }, local);
  await assert.rejects(offline.save(['未保存内容']));
  assert.deepEqual(JSON.parse(local.getItem('dsh-rollback:offline')).edits, ['未保存内容']);
  await assert.rejects(offline.flush());
});
test('local storage quota cannot prevent host persistence', async () => {
  let saved = false;
  const writer = new DraftWriter('t', 0, async () => { saved = true; return { revision: 1 }; }, { setItem() { throw new Error('quota'); }, getItem() { return null; }, removeItem() {} });
  await writer.save(['data']);
  assert.ok(saved);
});
