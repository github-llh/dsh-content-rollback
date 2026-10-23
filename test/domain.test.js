import test from 'node:test';
import assert from 'node:assert/strict';
import { messagePlan, editContent, validateRequest, digest, isUserMessage, replyContent } from '../src/host/domain.js';
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
test('quoted replies keep the selection as a quoted block before the reply', () => {
  assert.deepEqual(replyContent('补充说明', '第一行\r\n第二行'), [
    { type: 'text', text: '> 第一行\n> 第二行\n\n' },
    { type: 'text', text: '补充说明' },
  ]);
  assert.deepEqual(replyContent('只有回复', ''), [{ type: 'text', text: '只有回复' }]);
  assert.deepEqual(replyContent('  缩进\n代码  ', '')[0].text, '  缩进\n代码');
  assert.deepEqual(replyContent('保留\n空行', 'a\n\nb')[0].text, '> a\n>\n> b\n\n');
  assert.throws(() => replyContent('  ', 'quote'), { code: 'EMPTY_REPLY' });
  assert.throws(() => replyContent('x'.repeat(16001)), { code: 'REPLY_TOO_LONG' });
  assert.throws(() => replyContent('ok', 'x'.repeat(4001)), { code: 'QUOTE_TOO_LONG' });
  assert.throws(() => replyContent('ok', '\u0000\u0001'), { code: 'INVALID_QUOTE' });
});
test('reply requests require a UUID idempotency key', () => {
  const requestId = '2f1c9a3e-4b5d-4c6e-8f70-123456789abc';
  assert.equal(validateRequest({ action: 'reply', text: 'hi', requestId }).requestId, requestId);
  assert.throws(() => validateRequest({ action: 'reply', text: 'hi', requestId: 'nope' }), { code: 'BAD_REQUEST_ID' });
  assert.throws(() => validateRequest({ action: 'reply', text: 'hi' }), { code: 'BAD_REQUEST_ID' });
});

test('request validation covers the same-session operation contract', () => {
  for (const action of ['retry', 'edit', 'send']) assert.equal(validateRequest({ action: 'execute', token: 'a'.repeat(36), mode: action }).mode, action);
  assert.throws(() => validateRequest({ action: 'execute', token: 'a'.repeat(36), mode: 'withdraw' }), { code: 'BAD_MODE' });
  assert.throws(() => validateRequest({ action: 'execute', token: '../../evil', mode: 'retry' }), { code: 'BAD_TOKEN' });
  assert.throws(() => validateRequest({ action: 'prepare', seq: -1 }), { code: 'BAD_SEQUENCE' });
  assert.ok(isUserMessage(user(1)));
});
