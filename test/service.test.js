import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Vault } from '../src/host/vault.js';
import { RecoveryService } from '../src/host/service.js';
import { RecoveryError, digest } from '../src/host/domain.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-rollback-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = new Vault(root);
  await vault.init();
  const content = [{ type: 'text', text: '  原文\r\n正文  ' }];
  const event = { seq: 2, time: 100, type: 'user/message', data: { id: 'original-message', role: 'user', source: { kind: 'user' }, content } };
  const events = [{ seq: 0, type: 'turn/start' }, event, { seq: 3, type: 'assistant/message' }];
  const history = new Map([['source', events], ['other', events]]);
  const calls = { sent: [], disposed: 0, stopped: [], route: { provider: 'provider', model: 'model' } };
  const route = { provider: 'provider', model: 'model' };
  const host = {
    allowed: (id) => calls.allowed?.(id) ?? true,
    attachments: {},
    observe: async (id) => ({ events: history.get(id) ?? [], [Symbol.dispose]() { calls.disposed++; } }),
    route: () => calls.route,
    quiesce: async (id, stop) => { if (stop) calls.stopped.push(id); },
    flush: async () => calls.flush?.() ?? true,
    cursor: async (id) => (history.get(id)?.at(-1)?.seq ?? -1) + 1,
    validateContent: async () => {},
    send: (id, next, messageId) => { calls.sent.push({ id, content: structuredClone(next), messageId }); history.get(id).push({ type: 'user/message', data: { id: messageId } }); },
    hasMessage: async (id, messageId) => history.get(id).some((item) => item.data?.id === messageId),
  };
  return { api: new RecoveryService(host, vault), host, vault, history, event, calls, route };
}

test('retry replays the exact original content in the same session', async (t) => {
  const { api, event, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  assert.equal(plan.scope, 'same-session');
  assert.equal(plan.version, 2);
  const request = { action: 'execute', token: plan.token, mode: 'retry', route };
  const [first, second] = await Promise.all([api.request('source', request), api.request('source', request)]);
  assert.equal(first.state, 'accepted');
  assert.equal(second.state, 'accepted');
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].id, 'source');
  assert.deepEqual(calls.sent[0].content, event.data.content);
});

test('no code path creates, switches, or navigates to another session', async (t) => {
  const { api, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  const result = await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route });
  assert.equal(result.childSessionId, undefined);
  assert.equal(result.sourceSessionId, 'source');
  assert.equal(JSON.stringify(result).includes('child'), false);
  assert.equal(calls.sent[0].id, 'source');
});

test('edit only unlocks the editor; history is never cancelled or replaced', async (t) => {
  const { api, calls } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  const ready = await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  assert.equal(ready.state, 'ready');
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.stopped.length, 0);
});

test('edited text is sent in the same session and survives a restart', async (t) => {
  const { api, host, vault, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  await api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['modified'] });
  const restarted = new RecoveryService(host, vault);
  const draft = await restarted.request('source', { action: 'load-draft', token: plan.token });
  assert.equal(draft.content[0].text, 'modified');
  assert.equal(draft.originalContent[0].text, '  原文\r\n正文  ');
  await restarted.request('source', { action: 'execute', token: plan.token, mode: 'send', route, revision: 1 });
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].id, 'source');
  assert.equal(calls.sent[0].content[0].text, 'modified');
});

test('another session cannot address a saved operation', async (t) => {
  const { api } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await assert.rejects(api.request('other', { action: 'execute', token: plan.token, mode: 'retry' }), { code: 'FORBIDDEN' });
});

test('sending before the editor is unlocked is refused', async (t) => {
  const { api, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await assert.rejects(api.request('source', { action: 'execute', token: plan.token, mode: 'send', route, revision: 0 }), { code: 'OPEN_EDITOR_FIRST' });
  assert.equal(calls.sent.length, 0);
});

test('a changed model blocks sending without losing the edit', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  await api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['keep'] });
  // The model was switched in another place after the page captured this route.
  host.route = () => ({ provider: 'other', model: 'text-only' });
  const result = await api.request('source', { action: 'execute', token: plan.token, mode: 'send', route, revision: 1 });
  assert.equal(result.state, 'ready');
  assert.equal(result.error, 'MODEL_CHANGED');
  assert.equal(calls.sent.length, 0);
  const draft = await api.request('source', { action: 'load-draft', token: plan.token });
  assert.equal(draft.content[0].text, 'keep');
});

test('unknown send outcome never triggers a second automatic send', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  host.send = () => { calls.sent.push('attempt'); throw new Error('transport interrupted'); };
  const request = { action: 'execute', token: plan.token, mode: 'retry', route };
  assert.equal((await api.request('source', request)).state, 'uncertain');
  assert.equal((await api.request('source', request)).state, 'uncertain');
  assert.equal(calls.sent.length, 1);
});

test('an admitted message that failed to persist becomes uncertain until durability is proven', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  host.flush = async () => calls.sent.length === 0;
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  const result = await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route });
  assert.equal(result.state, 'uncertain');
  assert.equal((await api.request('source', { action: 'status', token: plan.token })).state, 'uncertain');
  host.flush = async () => true;
  assert.equal((await api.request('source', { action: 'status', token: plan.token })).state, 'accepted');
});

test('stale draft revisions are rejected without overwriting the saved draft', async (t) => {
  const { api } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['first'] });
  await assert.rejects(api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['stale'] }), { code: 'DRAFT_CONFLICT' });
  assert.equal((await api.request('source', { action: 'load-draft', token: plan.token })).content[0].text, 'first');
});

test('backup failure happens before stopping or sending anything', async (t) => {
  const { api, vault, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  vault.verify = async () => { throw new Error('disk corrupt'); };
  await assert.rejects(api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), /disk corrupt/);
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.stopped.length, 0);
});

test('unconfirmed persistence blocks sending', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  host.flush = async () => false;
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  await assert.rejects(api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'NO_PERSISTENCE' });
  assert.equal(calls.sent.length, 0);
});

test('a running session is only stopped when the user asked for it', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  host.quiesce = async () => { throw new RecoveryError('SESSION_RUNNING'); };
  await assert.rejects(api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'SESSION_RUNNING' });
  assert.equal(calls.sent.length, 0);
});

test('pagination stays inside the requesting session', async (t) => {
  const { api, history, event } = await fixture(t);
  history.set('source', Array.from({ length: 70 }, (_, i) => ({ ...event, seq: i })));
  const page = await api.request('source', { action: 'list' });
  assert.equal(page.items.length, 30);
  assert.equal(page.items[0].seq, 69);
  assert.equal(page.hasMore, true);
  assert.equal((await api.request('source', { action: 'list', before: 40 })).items[0].seq, 39);
  assert.equal((await api.request('other', { action: 'list' })).items.length, 1);
});

test('locks from a proven-dead process are reclaimed; live locks are respected', async (t) => {
  const { api, vault, calls, route } = await fixture(t);
  const directory = join(vault.root, 'locks');
  await mkdir(directory);
  await writeFile(join(directory, digest('source')), JSON.stringify({ version: 1, pid: 2147483647, token: 'dead-owner' }));
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  assert.equal((await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route })).state, 'accepted');
  await writeFile(join(directory, digest('source')), JSON.stringify({ version: 2, pid: process.pid, token: 'live-owner' }));
  const second = await api.request('source', { action: 'prepare', seq: 2 });
  await assert.rejects(api.request('source', { action: 'execute', token: second.token, mode: 'retry', route }), { code: 'RECOVERY_LOCKED' });
  assert.equal(calls.sent.length, 1);
});

test('full pipeline backs up image and video bytes and replays exact ordered blocks', async (t) => {
  const { api, host, event, vault, calls, route } = await fixture(t);
  const image = Buffer.from('sent image bytes');
  const video = Buffer.from('video bytes');
  const ref = (data, name) => ({ attachmentId: `sha256:${createHash('sha256').update(data).digest('hex')}`, name, bytes: data.length });
  const imageRef = { ...ref(image, '图片.png'), mediaType: 'image/png', width: 1, height: 1 };
  const videoRef = ref(video, 'video.mp4');
  event.data.content = [{ type: 'text', text: 'first' }, { type: 'image', attachment: imageRef, offloaded: true }, { type: 'text', text: 'last' }, { type: 'file', attachment: videoRef }];
  host.attachments = { readImage: async () => ({ ref: imageRef, data: image }), async *readFileStream() { yield video; } };
  const plan = await api.request('source', { action: 'prepare', seq: 2 });
  assert.equal((await vault.readRecord('snapshots', 'source:2')).objects.length, 2);
  await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route });
  assert.deepEqual(calls.sent[0].content, event.data.content);
});
