import { createHash } from 'node:crypto';

export class RecoveryError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
  }
}

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const isUserMessage = (event) => event.type === 'user/message' && event.data?.role === 'user' && event.data.source?.kind === 'user';
/** Only append-origin messages are real user input; replacements re-position content. */
export const isAppendUserMessage = (event) => isUserMessage(event) && (event.surfaceOp === 'append' || event.surfaceOp === undefined);

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

/** Message id shared by the suppressed wake-up prompt and the landed replacement event. */
export const retractionMessageId = (token) => `rollback-${token}`;

/**
 * Shadow range that retracts one user message and everything the model saw
 * after it: from the message's surface position through the current surface
 * tail. The durable log keeps every event; only the derived history changes.
 */
export function retractRange(surfaceNodes, seq) {
  const startIdx = surfaceNodes.indexOf(seq);
  if (startIdx < 0) throw new RecoveryError('MESSAGE_NOT_FOUND');
  const endIdx = surfaceNodes.length - 1;
  if (endIdx < startIdx) throw new RecoveryError('SOURCE_CHANGED');
  return { startSeq: seq, endSeq: surfaceNodes[endIdx], shadowedSeqs: surfaceNodes.slice(startIdx, endIdx + 1) };
}

/** Whether a stored range still describes the exact current surface tail. */
export function retractRangeIntact(surfaceNodes, range) {
  if (!range || !Number.isSafeInteger(range.startSeq) || !Number.isSafeInteger(range.endSeq) || !Array.isArray(range.shadowedSeqs)) return false;
  const startIdx = surfaceNodes.indexOf(range.startSeq);
  const endIdx = surfaceNodes.indexOf(range.endSeq);
  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx || endIdx !== surfaceNodes.length - 1) return false;
  const shadowed = surfaceNodes.slice(startIdx, endIdx + 1);
  return shadowed.length === range.shadowedSeqs.length && shadowed.every((seq, index) => seq === range.shadowedSeqs[index]);
}

/** Surface metadata for the replacement event that lands the retraction. */
export function retractionSurfaceOp(range) {
  return {
    surfaceOp: { op: 'replace', startSeq: range.startSeq, endSeq: range.endSeq },
    sourceEventSeqs: [...range.shadowedSeqs],
  };
}

/** Marker the reply transport stamps on quoted replies so the UI can render the quote as a card. */
export const replyMarker = { kind: 'quote-reply' };

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new RecoveryError('BAD_REQUEST');
  if (!['list', 'prepare', 'execute', 'status', 'save-draft', 'load-draft', 'reply', 'inspect', 'resend', 'retry-turn', 'marks'].includes(request.action)) throw new RecoveryError('BAD_ACTION');
  if (['prepare', 'inspect'].includes(request.action) && (!Number.isSafeInteger(request.seq) || request.seq < 0)) throw new RecoveryError('BAD_SEQUENCE');
  if (['execute', 'status', 'save-draft', 'load-draft'].includes(request.action) && !/^[0-9a-f-]{36}$/.test(request.token ?? '')) throw new RecoveryError('BAD_TOKEN');
  if (request.action === 'execute' && !['retry', 'edit', 'send'].includes(request.mode)) throw new RecoveryError('BAD_MODE');
  if (['reply', 'resend', 'retry-turn'].includes(request.action) && !UUID.test(request.requestId ?? '')) throw new RecoveryError('BAD_REQUEST_ID');
  if (request.action === 'resend') {
    if (!Number.isSafeInteger(request.seq) || request.seq < 0) throw new RecoveryError('BAD_SEQUENCE');
    if (request.edits !== undefined && (!Array.isArray(request.edits) || request.edits.length > 256 || request.edits.some((text) => typeof text !== 'string'))) throw new RecoveryError('INVALID_EDITS');
  }
  if (request.action === 'retry-turn' && (typeof request.messageId !== 'string' || request.messageId.length === 0 || request.messageId.length > 200)) throw new RecoveryError('BAD_MESSAGE_ID');
  if (request.route !== undefined && (typeof request.route !== 'object' || request.route === null || typeof request.route.provider !== 'string' || typeof request.route.model !== 'string')) throw new RecoveryError('BAD_ROUTE');
  if (request.before !== undefined && (!Number.isSafeInteger(request.before) || request.before < 0)) throw new RecoveryError('BAD_SEQUENCE');
  if (Buffer.byteLength(JSON.stringify(request)) > 2 * 1024 * 1024) throw new RecoveryError('REQUEST_TOO_LARGE');
  return request;
}

export function publicOperation(operation) {
  const { version, scope, token, sourceSessionId, seq, time, state, mode, route, error, updatedAt, retractSkipped } = operation;
  return { version, scope, token, sourceSessionId, seq, time, state, mode, route, error, updatedAt, ...(retractSkipped === undefined ? {} : { retractSkipped }) };
}
