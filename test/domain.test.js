import test from 'node:test';
import assert from 'node:assert/strict';
import { messagePlan, editContent, validateRequest, digest, isUserMessage } from '../src/host/domain.js';
const user = (seq, content = [{ type: 'text', text: '  原文\r\n正文  ' }]) => ({ seq, time: 1, type: 'user/message', data: { id: `message-${seq}`, role: 'user', source: { kind: 'user' }, content } });
test('a sent message is recoverable without a turn boundary', () => {
  const events = [{ seq: 0, type: 'turn/start' }, user(1), { seq: 2, type: 'tool/call' }, { seq: 3, type: 'assistant/message' }];
  const plan = messagePlan(events, 1);
  assert.equal(plan.event.seq, 1);
  assert.equal(plan.toolCalls, 1);
  assert.equal(plan.fingerprint, digest(events[1]));
});
test('missing or non-user messages are rejected', () => {
  assert.throws(() => messagePlan([{ seq: 0, type: 'assistant/message' }], 0), { code: 'MESSAGE_NOT_FOUND' });
  assert.throws(() => messagePlan([user(0)], 7), { code: 'MESSAGE_NOT_FOUND' });
  assert.throws(() => messagePlan([{ ...user(0), data: { role: 'user', source: { kind: 'agent-message' }, content: [] } }], 0), { code: 'MESSAGE_NOT_FOUND' });
});
test('edits keep exact order, attachments and unknown metadata', () => {
  const content = [{ type: 'text', text: 'before' }, { type: 'image', attachment: { attachmentId: 'sha256:a' }, offloaded: true }, { type: 'text', text: 'after' }, { type: 'file', attachment: { name: 'movie.mp4', attachmentId: 'sha256:b' } }];
  const copy = structuredClone(content);
  assert.deepEqual(editContent(content), copy);
  const edited = editContent(content, ['first', 'last']);
  assert.equal(edited[0].text, 'first');
  assert.deepEqual(edited[1], content[1]);
  assert.deepEqual(edited[3], content[3]);
  assert.deepEqual(content, copy);
  assert.throws(() => editContent(content, ['short']), { code: 'INVALID_EDITS' });
  assert.throws(() => editContent([{ type: 'text', text: 'hi' }], ['  ']), { code: 'EMPTY_MESSAGE' });
});
test('request validation covers the same-session operation contract', () => {
  for (const action of ['retry', 'edit', 'send']) assert.equal(validateRequest({ action: 'execute', token: 'a'.repeat(36), mode: action }).mode, action);
  assert.throws(() => validateRequest({ action: 'execute', token: 'a'.repeat(36), mode: 'withdraw' }), { code: 'BAD_MODE' });
  assert.throws(() => validateRequest({ action: 'execute', token: '../../evil', mode: 'retry' }), { code: 'BAD_TOKEN' });
  assert.throws(() => validateRequest({ action: 'prepare', seq: -1 }), { code: 'BAD_SEQUENCE' });
  assert.ok(isUserMessage(user(1)));
});
