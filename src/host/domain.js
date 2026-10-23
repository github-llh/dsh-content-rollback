import { createHash } from 'node:crypto';

export class RecoveryError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
  }
}

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const isUserMessage = (event) => event.type === 'user/message' && event.data?.role === 'user' && event.data.source?.kind === 'user';

export function messagePlan(events, seq) {
  const index = events.findIndex((event) => event.seq === seq);
  const event = events[index];
  if (!event || !isUserMessage(event)) throw new RecoveryError('MESSAGE_NOT_FOUND');
  if (!Array.isArray(event.data.content)) throw new RecoveryError('UNSUPPORTED_CONTENT');
  return {
    event, fingerprint: digest(event),
    unsupported: event.data.content.some((part) => !['text', 'image', 'file'].includes(part.type)),
    toolCalls: events.slice(index).filter((item) => item.type === 'tool/call').length,
    hasPathReferences: event.data.content.some((part) => part.type === 'text' && /(^|\s)@(?:\/|[A-Za-z]:[\\/]|\.\.?[\\/])/.test(part.text)),
  };
}

export function editContent(content, edits) {
  if (edits === undefined) return structuredClone(content);
  if (!Array.isArray(edits) || edits.length !== content.filter((block) => block.type === 'text').length || edits.some((text) => typeof text !== 'string')) {
    throw new RecoveryError('INVALID_EDITS');
  }
  let index = 0;
  const next = content.map((block) => block.type === 'text' ? { ...block, text: edits[index++] } : structuredClone(block));
  if (!next.some((block) => block.type !== 'text' || block.text.trim())) throw new RecoveryError('EMPTY_MESSAGE');
  return next;
}

const REPLY_LIMIT = 16000;
const QUOTE_LIMIT = 4000;

function cleanText(value, limit, code, trim = true) {
  if (typeof value !== 'string') throw new RecoveryError(code);
  let text = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  text = trim ? text.trim() : text.replace(/^\n+|\n+$/g, '').replace(/[ \t]+$/, '');
  if (!text.trim()) throw new RecoveryError(code);
  if (text.length > limit) throw new RecoveryError(code === 'INVALID_QUOTE' ? 'QUOTE_TOO_LONG' : 'REPLY_TOO_LONG');
  return text;
}

export function replyContent(text, quote) {
  const body = cleanText(text, REPLY_LIMIT, 'EMPTY_REPLY', false);
  const content = [];
  if (quote !== undefined && quote !== '') {
    const quoted = cleanText(quote, QUOTE_LIMIT, 'INVALID_QUOTE');
    content.push({ type: 'text', text: `${quoted.split('\n').map((line) => line ? `> ${line}` : '>').join('\n')}\n\n` });
  }
  content.push({ type: 'text', text: body });
  return content;
}

export function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new RecoveryError('BAD_REQUEST');
  if (!['list', 'prepare', 'execute', 'status', 'save-draft', 'load-draft', 'reply'].includes(request.action)) throw new RecoveryError('BAD_ACTION');
  if (request.action === 'prepare' && (!Number.isSafeInteger(request.seq) || request.seq < 0)) throw new RecoveryError('BAD_SEQUENCE');
  if (['execute', 'status', 'save-draft', 'load-draft'].includes(request.action) && !/^[0-9a-f-]{36}$/.test(request.token ?? '')) throw new RecoveryError('BAD_TOKEN');
  if (request.action === 'execute' && !['retry', 'edit', 'send'].includes(request.mode)) throw new RecoveryError('BAD_MODE');
  if (request.action === 'reply' && !/^[0-9a-f-]{36}$/.test(request.requestId ?? '')) throw new RecoveryError('BAD_REQUEST_ID');
  if (request.before !== undefined && (!Number.isSafeInteger(request.before) || request.before < 0)) throw new RecoveryError('BAD_SEQUENCE');
  if (Buffer.byteLength(JSON.stringify(request)) > 2 * 1024 * 1024) throw new RecoveryError('REQUEST_TOO_LARGE');
  return request;
}

export function publicOperation(operation) {
  const { version, scope, token, sourceSessionId, seq, state, mode, route, error, updatedAt } = operation;
  return { version, scope, token, sourceSessionId, seq, state, mode, route, error, updatedAt };
}
