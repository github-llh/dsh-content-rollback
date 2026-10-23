import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Vault } from '../src/host/vault.js';
import { RecoveryService } from '../src/host/service.js';
import { RecoveryError, digest } from '../src/host/domain.js';

async function rejects(task, expected) {
  try { await task(); }
  catch (error) {
    if (expected instanceof RegExp) assert.match(error.message, expected);
    else assert.equal(error.code, expected.code);
    return;
  }
  assert.fail('expected the request to be rejected');
}

const SURFACE_TYPES = new Set(['system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result']);

/** Minimal Session double: append-only log plus the canonical surface fold. */
function createSession(seed) {
  const log = seed.map((event) => ({ ...event, time: event.time ?? event.seq }));
  const nodes = [];
  for (const event of log) {
    if (!SURFACE_TYPES.has(event.type)) continue;
    const op = event.surfaceOp;
    if (op === undefined || op === 'append') nodes.push(event.seq);
    else if (op?.op === 'replace') {
      const start = nodes.indexOf(op.startSeq);
      const end = nodes.indexOf(op.endSeq);
      if (start >= 0 && end >= start) nodes.splice(start, end - start + 1, event.seq);
    }
  }
  return {
    log,
    get seq() { return log.length; },
    surface: { get nodes() { return [...nodes]; } },
    eventAt: (seq) => log.find((item) => item.seq === seq),
    append(type, data, options = {}) {
      const event = { type, seq: log.length, time: log.length, data: structuredClone(data) };
      if (options.surfaceOp !== undefined) event.surfaceOp = options.surfaceOp;
      if (options.sourceEventSeqs !== undefined) event.sourceEventSeqs = options.sourceEventSeqs;
      if (SURFACE_TYPES.has(type)) {
        const op = event.surfaceOp;
        if (op === undefined || op === 'append') nodes.push(event.seq);
        else if (op?.op === 'replace') {
          const start = nodes.indexOf(op.startSeq);
          const end = nodes.indexOf(op.endSeq);
          if (start < 0 || end < start) throw new Error('surface replace endpoints must be current surface nodes');
          const shadowed = nodes.slice(start, end + 1);
          const sources = new Set(event.sourceEventSeqs ?? []);
          if (!shadowed.every((seq) => sources.has(seq))) throw new Error('sourceEventSeqs must cover every shadowed node');
          nodes.splice(start, end - start + 1, event.seq);
        }
      }
      log.push(event);
      return event;
    },
  };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-rollback-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = new Vault(root);
  await vault.init();
  const content = [{ type: 'text', text: '  原文\r\n正文  ' }];
  const event = { seq: 1, time: 100, type: 'user/message', data: { id: 'original-message', role: 'user', source: { kind: 'user' }, content } };
  const events = [{ seq: 0, type: 'turn/start' }, event, { seq: 2, type: 'assistant/message', data: { message: { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: '回答' }] } } }];
  const sessions = new Map([['source', createSession(events)], ['other', createSession(events)]]);
  const inboxes = new Map([['source', []], ['other', []]]);
  const calls = { sent: [], landed: [], followups: [], disposed: 0, stopped: [], route: { provider: 'provider', model: 'model' } };
  const route = { provider: 'provider', model: 'model' };
  const host = {
    allowed: (id) => calls.allowed?.(id) ?? true,
    attachments: {},
    observe: async (id) => ({ events: sessions.get(id)?.log ?? [], [Symbol.dispose]() { calls.disposed++; } }),
    route: () => calls.route,
    activity: () => ({ running: calls.running ?? false, queued: calls.queued ?? 0 }),
    quiesce: async (id, stop) => { if (stop) calls.stopped.push(id); },
    flush: async () => calls.flush?.() ?? true,
    surface: (id) => {
      const session = sessions.get(id);
      if (!session) throw new RecoveryError('SESSION_NOT_ACTIVE');
      return { nodes: session.surface.nodes, eventAt: (seq) => session.eventAt(seq) };
    },
    appendSurface: (id, type, data, options) => {
      const appended = sessions.get(id).append(type, data, options);
      calls.landed.push({ id, type, seq: appended.seq, data: structuredClone(data), options });
      return appended;
    },
    validateContent: async () => {},
    followup: (id, message) => {
      calls.followups.push({ id, message: structuredClone(message) });
      inboxes.get(id).push(message);
      sessions.get(id).append('agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [message] });
    },
    pending: (id, messageId) => inboxes.get(id)?.some((message) => message.id === messageId) ?? false,
    hasMessage: async (id, messageId) => sessions.get(id)?.log.some((item) => item.type === 'user/message' && item.data?.id === messageId) ?? false,
    async reply(id, content, messageId, signal, marker) {
      if (sessions.get(id).log.some((item) => item.data?.id === messageId)) return { accepted: true, messageId, duplicate: true };
      calls.sent.push({ id, content: structuredClone(content), messageId, marker });
      sessions.get(id).append('user/message', { id: messageId, role: 'user', content, source: { kind: 'user', ...(marker === undefined ? {} : { 'content-rollback': marker }) } }, { surfaceOp: 'append' });
      return { accepted: true, messageId };
    },
  };
  return { api: new RecoveryService(host, vault), host, vault, sessions, inboxes, event, calls, route,
    /** Simulate the loop claiming the wake-up prompt at pre-step time. */
    claim: (id, messageId) => {
      const inbox = inboxes.get(id);
      const index = inbox.findIndex((message) => message.id === messageId);
      return index < 0 ? null : inbox.splice(index, 1)[0];
    } };
}

test('retry replays the exact original content in the same session', async (t) => {
  const { api, event, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  assert.equal(plan.scope, 'same-session');
  assert.equal(plan.version, 2);
  const request = { action: 'execute', token: plan.token, mode: 'retry', route };
  const [first, second] = await Promise.all([api.request('source', request), api.request('source', request)]);
  assert.equal(first.state, 'accepted');
  assert.equal(second.state, 'accepted');
  assert.equal(calls.landed.length, 1);
  assert.deepEqual(calls.landed[0].data.content, event.data.content);
  assert.equal(calls.followups.length, 1);
});

test('no code path creates, switches, or navigates to another session', async (t) => {
  const { api, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  const result = await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route });
  assert.equal(result.childSessionId, undefined);
  assert.equal(result.sourceSessionId, 'source');
  assert.equal(JSON.stringify(result).includes('child'), false);
  assert.equal(calls.landed[0].id, 'source');
});

test('edit only unlocks the editor; nothing is sent or retracted yet', async (t) => {
  const { api, calls } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  const ready = await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  assert.equal(ready.state, 'ready');
  assert.equal(calls.landed.length, 0);
  assert.equal(calls.stopped.length, 0);
});

test('edited text is sent in the same session and survives a restart', async (t) => {
  const { api, host, vault, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  await api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['modified'] });
  const restarted = new RecoveryService(host, vault);
  const draft = await restarted.request('source', { action: 'load-draft', token: plan.token });
  assert.equal(draft.content[0].text, 'modified');
  assert.equal(draft.originalContent[0].text, '  原文\r\n正文  ');
  await restarted.request('source', { action: 'execute', token: plan.token, mode: 'send', route, revision: 1 });
  assert.equal(calls.landed.length, 1);
  assert.equal(calls.landed[0].data.content[0].text, 'modified');
});

test('one-shot resend is idempotent and keeps the exact original content', async (t) => {
  const { api, event, calls } = await fixture(t);
  const request = { action: 'resend', seq: 1, requestId: randomUUID() };
  const first = await api.request('source', request);
  const second = await api.request('source', request);
  assert.equal(first.state, 'accepted');
  assert.equal(first.retracted, true);
  assert.equal(second.state, 'accepted');
  assert.equal(calls.landed.length, 1);
  assert.deepEqual(calls.landed[0].data.content, event.data.content);
  assert.equal(calls.landed[0].data.id, `rollback-${request.requestId}`);
  assert.equal(calls.followups.length, 1);
  assert.equal(calls.followups[0].message.id, `rollback-${request.requestId}`);
});

test('a retraction shadows the message and its successor turns in one replacement', async (t) => {
  const { api, sessions } = await fixture(t);
  const before = sessions.get('source').surface.nodes;
  assert.deepEqual(before, [1, 2]);
  const request = { action: 'resend', seq: 1, requestId: randomUUID(), edits: ['改过的内容'] };
  const result = await api.request('source', request);
  assert.equal(result.state, 'accepted');
  const session = sessions.get('source');
  const nodes = session.surface.nodes;
  // The original message and the answer are shadowed; the replacement carries
  // the edited content at the original position.
  assert.equal(nodes.length, 1);
  const replacement = session.eventAt(nodes[0]);
  assert.equal(replacement.type, 'user/message');
  assert.equal(replacement.data.content[0].text, '改过的内容');
  assert.deepEqual(replacement.surfaceOp, { op: 'replace', startSeq: 1, endSeq: 2 });
  assert.deepEqual(replacement.sourceEventSeqs, [1, 2]);
  // The durable log keeps every original event: the transcript is untouched.
  assert.equal(session.log.filter((item) => item.type === 'user/message').length, 2);
  assert.equal(session.eventAt(1).data.id, 'original-message');
});

test('a landed retraction is not listed as a new user message', async (t) => {
  const { api } = await fixture(t);
  assert.equal((await api.request('source', { action: 'list' })).items.length, 1);
  await api.request('source', { action: 'resend', seq: 1, requestId: randomUUID(), edits: ['改过的内容'] });
  const page = await api.request('source', { action: 'list' });
  // The replacement re-positions content; it is not new input to recover.
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].seq, 1);
  assert.equal(page.items[0].preview, '  原文\r\n正文  ');
});

test('the claimed wake-up prompt is suppressed once the retraction is the surface tail', async (t) => {
  const { api, claim } = await fixture(t);
  const requestId = randomUUID();
  await api.request('source', { action: 'resend', seq: 1, requestId, edits: ['改过的内容'] });
  const claimed = claim('source', `rollback-${requestId}`);
  assert.ok(claimed);
  assert.equal(await api.landRetraction('source', requestId), 'suppress');
  // Idempotent: a second claim decision still suppresses.
  assert.equal(await api.landRetraction('source', requestId), 'suppress');
});

test('a conversation that moved on delivers the prompt without retracting', async (t) => {
  const { api, sessions, claim } = await fixture(t);
  const requestId = randomUUID();
  await api.request('source', { action: 'resend', seq: 1, requestId });
  claim('source', `rollback-${requestId}`);
  // The user sent another message after the retraction landed.
  sessions.get('source').append('user/message', { id: 'later', role: 'user', content: [{ type: 'text', text: '后来的消息' }], source: { kind: 'user' } }, { surfaceOp: 'append' });
  assert.equal(await api.landRetraction('source', requestId), 'deliver');
  const operation = await api.operation(requestId);
  assert.equal(operation.retractSkipped, 'STALE');
});

test('a retraction whose target moved is refused before anything lands', async (t) => {
  const { api, host, sessions, calls } = await fixture(t);
  host.quiesce = async () => { throw new RecoveryError('SESSION_RUNNING'); };
  const request = { action: 'resend', seq: 1, requestId: randomUUID() };
  await rejects(() => api.request('source', request), { code: 'SESSION_RUNNING' });
  // The user kept talking while the send was paused; the stored range ended at
  // the old tail, so the retry refuses instead of retracting the newer message.
  host.quiesce = async () => {};
  sessions.get('source').append('user/message', { id: 'later', role: 'user', content: [{ type: 'text', text: '后来的消息' }], source: { kind: 'user' } }, { surfaceOp: 'append' });
  await rejects(() => api.request('source', request), { code: 'RETRACT_STALE' });
  const operation = await api.operation(request.requestId);
  assert.equal(operation.state, 'prepared');
  assert.equal(operation.error, 'RETRACT_STALE');
  assert.equal(calls.landed.length, 0);
  assert.equal(calls.followups.length, 0);
  const pending = await api.request('source', { action: 'list' });
  assert.equal(pending.pending.token, request.requestId);
});

test('concurrent resends with one request id land exactly one replacement', async (t) => {
  const { api, event, calls } = await fixture(t);
  const request = { action: 'resend', seq: 1, requestId: randomUUID() };
  const [first, second] = await Promise.all([api.request('source', request), api.request('source', request)]);
  assert.equal(first.state, 'accepted');
  assert.equal(second.state, 'accepted');
  assert.equal(calls.landed.length, 1);
  assert.deepEqual(calls.landed[0].data.content, event.data.content);
  assert.equal(calls.followups.length, 1);
});

test('reusing a request id with different edits is refused', async (t) => {
  const { api, host } = await fixture(t);
  host.quiesce = async () => { throw new RecoveryError('SESSION_RUNNING'); };
  const request = { action: 'resend', seq: 1, requestId: randomUUID(), edits: ['first'] };
  await rejects(() => api.request('source', request), { code: 'SESSION_RUNNING' });
  await rejects(() => api.request('source', { ...request, edits: ['changed'] }), { code: 'REQUEST_CONFLICT' });
});

test('retry-turn resends the user message that produced the answer', async (t) => {
  const { api, event, calls } = await fixture(t);
  const result = await api.request('source', { action: 'retry-turn', messageId: 'assistant-1', requestId: randomUUID() });
  assert.equal(result.state, 'accepted');
  assert.equal(calls.landed.length, 1);
  assert.deepEqual(calls.landed[0].data.content, event.data.content);
  // The old answer is shadowed together with the message that triggered it.
  assert.deepEqual(calls.landed[0].options.surfaceOp, { op: 'replace', startSeq: 1, endSeq: 2 });
});

test('retry-turn refuses an unknown assistant message', async (t) => {
  const { api, calls } = await fixture(t);
  await rejects(() => api.request('source', { action: 'retry-turn', messageId: 'missing', requestId: randomUUID() }), { code: 'MESSAGE_NOT_FOUND' });
  assert.equal(calls.landed.length, 0);
});

test('inspect reads the original content without reserving a draft', async (t) => {
  const { api, event } = await fixture(t);
  const result = await api.request('source', { action: 'inspect', seq: 1 });
  assert.deepEqual(result.content, event.data.content);
  assert.deepEqual(result.originalContent, event.data.content);
  assert.equal((await api.request('source', { action: 'list' })).pending, null);
  assert.equal((await api.request('source', { action: 'list' })).lastUserSeq, 1);
});

test('inspect and list expose the tool calls that follow a message', async (t) => {
  const { api, sessions } = await fixture(t);
  const session = sessions.get('source');
  session.append('tool/call', { name: 'bash' });
  session.append('tool/result', {});
  assert.equal((await api.request('source', { action: 'inspect', seq: 1 })).toolCalls, 1);
  assert.equal((await api.request('source', { action: 'list' })).items[0].toolCalls, 1);
});

test('another session cannot address a saved operation', async (t) => {
  const { api } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await rejects(() => api.request('other', { action: 'execute', token: plan.token, mode: 'retry' }), { code: 'FORBIDDEN' });
});

test('sending before the editor is unlocked is refused', async (t) => {
  const { api, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'send', route, revision: 0 }), { code: 'OPEN_EDITOR_FIRST' });
  assert.equal(calls.sent.length, 0);
});

test('a changed model blocks sending without losing the edit', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
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

test('a failed landing never triggers a second automatic send', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  const original = host.appendSurface;
  host.appendSurface = () => { throw new Error('transport interrupted'); };
  const request = { action: 'execute', token: plan.token, mode: 'retry', route };
  await rejects(() => api.request('source', request), /transport interrupted/);
  await rejects(() => api.request('source', request), /transport interrupted/);
  assert.equal(calls.landed.length, 0);
  assert.equal(calls.followups.length, 0);
  // The operation stays resumable, and the recovered transport lands it once.
  host.appendSurface = original;
  assert.equal((await api.request('source', request)).state, 'accepted');
  assert.equal(calls.landed.length, 1);
  assert.equal(calls.followups.length, 1);
});

test('a landed retraction that failed to persist queues nothing until durability is proven', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  host.flush = async () => false;
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'NO_PERSISTENCE' });
  // The flush barrier refuses before the wake-up prompt is queued.
  assert.equal(calls.landed.length, 1);
  assert.equal(calls.followups.length, 0);
  host.flush = async () => true;
  assert.equal((await api.request('source', { action: 'status', token: plan.token })).state, 'accepted');
  // The paused wake-up is re-queued exactly once.
  assert.equal(calls.followups.length, 1);
  assert.equal((await api.request('source', { action: 'status', token: plan.token })).state, 'accepted');
  assert.equal(calls.followups.length, 1);
});

test('stale draft revisions are rejected without overwriting the saved draft', async (t) => {
  const { api } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['first'] });
  await rejects(() => api.request('source', { action: 'save-draft', token: plan.token, revision: 0, edits: ['stale'] }), { code: 'DRAFT_CONFLICT' });
  assert.equal((await api.request('source', { action: 'load-draft', token: plan.token })).content[0].text, 'first');
});

test('backup failure happens before stopping or sending anything', async (t) => {
  const { api, vault, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  vault.verify = async () => { throw new Error('disk corrupt'); };
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), /disk corrupt/);
  assert.equal(calls.sent.length, 0);
  assert.equal(calls.stopped.length, 0);
});

test('unconfirmed persistence blocks sending', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  host.flush = async () => false;
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'NO_PERSISTENCE' });
  // The flush barrier refuses before the wake-up prompt is queued.
  assert.equal(calls.followups.length, 0);
});

test('a running session is only stopped when the user asked for it', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  host.quiesce = async () => { throw new RecoveryError('SESSION_RUNNING'); };
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'SESSION_RUNNING' });
  assert.equal(calls.sent.length, 0);
});

test('a quoted reply is added once to the same session even after a retry', async (t) => {
  const { api, calls } = await fixture(t);
  const request = { action: 'reply', text: '补充说明', quote: '被选中的句子', requestId: randomUUID() };
  const first = await api.request('source', request);
  const second = await api.request('source', request);
  assert.equal(first.accepted, true);
  assert.equal(second.duplicate, true);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].id, 'source');
  assert.deepEqual(calls.sent[0].content, [
    { type: 'text', text: '> 被选中的句子\n\n' },
    { type: 'text', text: '补充说明' },
  ]);
  // The marker lets the UI render the quote as a card.
  assert.deepEqual(calls.sent[0].marker, { kind: 'quote-reply' });
});

test('listing a session without permission is refused', async (t) => {
  const { api, calls } = await fixture(t);
  calls.allowed = () => false;
  await rejects(() => api.request('source', { action: 'list' }), { code: 'FORBIDDEN' });
});

test('a transient session change keeps the editor unlocked instead of resetting it', async (t) => {
  const { api, host, calls, route } = await fixture(t);
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  await api.request('source', { action: 'execute', token: plan.token, mode: 'edit' });
  const original = host.appendSurface;
  host.appendSurface = () => { throw new RecoveryError('SESSION_CHANGED'); };
  await rejects(() => api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route }), { code: 'SESSION_CHANGED' });
  assert.equal(calls.landed.length, 0);
  assert.equal(calls.followups.length, 0);
  const operation = await api.operation(plan.token);
  assert.equal(operation.state, 'ready');
  assert.equal(operation.error, 'SESSION_CHANGED');
  const draft = await api.request('source', { action: 'load-draft', token: plan.token });
  assert.equal(draft.originalContent[0].text, '  原文\r\n正文  ');
  // The editor is still unlocked, so the same operation can be sent again.
  host.appendSurface = original;
  assert.equal((await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route })).state, 'accepted');
});

test('quoted replies cannot target another session or leave out the text', async (t) => {
  const { api, calls } = await fixture(t);
  calls.allowed = (id) => id === 'source';
  await rejects(() => api.request('other', { action: 'reply', text: 'hi', requestId: randomUUID() }), { code: 'FORBIDDEN' });
  await rejects(() => api.request('source', { action: 'reply', text: '  ', requestId: randomUUID() }), { code: 'EMPTY_REPLY' });
  assert.equal(calls.sent.length, 0);
});

test('pagination stays inside the requesting session', async (t) => {
  const { api, sessions, event, calls } = await fixture(t);
  sessions.set('source', createSession(Array.from({ length: 70 }, (_, i) => ({ ...event, seq: i }))));
  const page = await api.request('source', { action: 'list' });
  assert.equal(page.items.length, 30);
  assert.equal(page.items[0].seq, 69);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.activity, { running: false, queued: 0 });
  calls.running = true;
  calls.queued = 2;
  assert.deepEqual((await api.request('source', { action: 'list' })).activity, { running: true, queued: 2 });
  assert.equal((await api.request('source', { action: 'list', before: 40 })).items[0].seq, 39);
  assert.equal((await api.request('other', { action: 'list' })).items.length, 1);
});

test('a crashed retraction re-queues its wake-up prompt exactly once', async (t) => {
  const { api, host, calls } = await fixture(t);
  const request = { action: 'resend', seq: 1, requestId: randomUUID() };
  const original = host.followup;
  let dropped = false;
  // Simulate a crash between landing the replacement and queueing the prompt.
  host.followup = (id, message) => { if (!dropped) { dropped = true; return; } original(id, message); };
  assert.equal((await api.request('source', request)).state, 'accepted');
  assert.equal(calls.followups.length, 0);
  const status = await api.request('source', { action: 'status', token: request.requestId });
  assert.equal(status.state, 'accepted');
  assert.equal(calls.followups.length, 1);
  await api.request('source', { action: 'status', token: request.requestId });
  assert.equal(calls.followups.length, 1);
});

test('retracted messages are reported per session for the transcript badge', async (t) => {
  const { api } = await fixture(t);
  assert.deepEqual(await api.request('source', { action: 'marks' }), { retracted: [] });
  await api.request('source', { action: 'resend', seq: 1, requestId: randomUUID(), edits: ['改过的内容'] });
  const marks = await api.request('source', { action: 'marks' });
  assert.equal(marks.retracted.length, 1);
  assert.equal(marks.retracted[0].seq, 1);
  assert.equal(marks.retracted[0].mode, 'edit');
  assert.deepEqual(await api.request('other', { action: 'marks' }), { retracted: [] });
});

test('locks from a proven-dead process are reclaimed; live locks are respected', async (t) => {
  const { api, vault, calls, route } = await fixture(t);
  const directory = join(vault.root, 'locks');
  await mkdir(directory);
  await writeFile(join(directory, digest('source')), JSON.stringify({ version: 1, pid: 2147483647, token: 'dead-owner' }));
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  assert.equal((await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route })).state, 'accepted');
  await writeFile(join(directory, digest('source')), JSON.stringify({ version: 2, pid: process.pid, token: 'live-owner' }));
  const second = await api.request('source', { action: 'prepare', seq: 1 });
  await rejects(() => api.request('source', { action: 'execute', token: second.token, mode: 'retry', route }), { code: 'RECOVERY_LOCKED' });
  assert.equal(calls.landed.length, 1);
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
  const plan = await api.request('source', { action: 'prepare', seq: 1 });
  assert.equal((await vault.readRecord('snapshots', 'source:1')).objects.length, 2);
  await api.request('source', { action: 'execute', token: plan.token, mode: 'retry', route });
  assert.deepEqual(calls.landed[0].data.content, event.data.content);
});
