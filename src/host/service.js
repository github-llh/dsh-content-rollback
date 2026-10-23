import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { RecoveryError, digest, editContent, isAppendUserMessage, messagePlan, publicOperation, replyContent, replyMarker, retractRange, retractRangeIntact, retractionMessageId, retractionSurfaceOp, validateRequest } from './domain.js';

export class RecoveryService {
  constructor(host, vault) {
    this.host = host;
    this.vault = vault;
    this.jobs = new Map();
    this.stopped = false;
  }

  async locked(key, task) {
    const previous = this.jobs.get(key) ?? Promise.resolve();
    const next = previous.then(task);
    // The journal only needs ordering, so it stores a settled tail; the caller
    // still receives the real rejection through `next`.
    const journal = next.catch(() => {});
    this.jobs.set(key, journal);
    try { return await next; }
    finally { if (this.jobs.get(key) === journal) this.jobs.delete(key); }
  }

  async request(callerId, input, signal) {
    if (this.stopped) throw new RecoveryError('UNLOADED');
    const request = validateRequest(input);
    signal?.throwIfAborted();
    if (!this.host.allowed(callerId)) throw new RecoveryError('FORBIDDEN');
    if (request.action === 'list') return this.list(callerId, request.before, signal);
    if (request.action === 'reply') return this.reply(callerId, request, signal);
    if (request.action === 'inspect') return this.inspect(callerId, request.seq, signal);
    if (request.action === 'resend') return this.resend(callerId, request, signal);
    if (request.action === 'retry-turn') return this.retryTurn(callerId, request, signal);
    if (request.action === 'marks') return this.marks(callerId);
    if (request.action === 'prepare') return this.locked(callerId, () => this.prepare(callerId, request.seq, signal));
    return this.locked(request.token, async () => {
      const operation = await this.vault.readRecord('operations', request.token);
      if (!operation || operation.version !== 2 || operation.scope !== 'same-session') throw new RecoveryError('OPERATION_NOT_FOUND');
      if (callerId !== operation.sourceSessionId || !this.host.allowed(operation.sourceSessionId)) throw new RecoveryError('FORBIDDEN');
      if (request.action === 'status') return this.reconcile(operation, signal);
      if (request.action === 'load-draft') return this.loadDraft(operation);
      if (request.action === 'save-draft') {
        if (!['prepared', 'ready'].includes(operation.state)) throw new RecoveryError('NOT_EDITABLE');
        const snapshot = await this.snapshot(operation);
        editContent(snapshot.event.data.content, request.edits);
        const previous = await this.vault.readRecord('drafts', operation.token);
        if (!Number.isSafeInteger(request.revision) || request.revision !== (previous?.revision ?? 0)) throw new RecoveryError('DRAFT_CONFLICT');
        const draft = { version: 1, token: operation.token, edits: request.edits, revision: request.revision + 1 };
        await this.vault.writeRecord('drafts', operation.token, draft);
        return { revision: draft.revision };
      }
      return this.locked(operation.sourceSessionId, () => this.execute(operation, request, signal));
    });
  }

  async list(sessionId, before, signal) {
    const observation = await this.host.observe(sessionId, signal);
    try {
      const all = observation.events;
      const messages = all.filter(isAppendUserMessage);
      const visible = messages.filter((event) => before === undefined || event.seq < before);
      const page = visible.slice(-30).reverse();
      const totalCalls = all.reduce((count, event) => count + (event.type === 'tool/call' ? 1 : 0), 0);
      const callsBefore = new Map();
      let seenCalls = 0;
      for (const event of all) {
        if (isAppendUserMessage(event)) callsBefore.set(event.seq, seenCalls);
        if (event.type === 'tool/call') seenCalls++;
      }
      const link = await this.vault.readRecord('drafts', `session:${sessionId}`);
      const pending = link ? await this.vault.readRecord('operations', link.token) : null;
      return {
        items: page.map((event) => ({
          seq: event.seq, time: event.time,
          preview: event.data.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').slice(0, 180),
          attachments: event.data.content.filter((part) => part.type !== 'text').map((part) => ({ type: part.type, name: part.attachment?.name, bytes: part.attachment?.bytes })),
          toolCalls: totalCalls - (callsBefore.get(event.seq) ?? 0),
        })),
        hasMore: visible.length > page.length,
        pending: pending && ['prepared', 'ready'].includes(pending.state) && this.host.allowed(pending.sourceSessionId) ? publicOperation(pending) : null,
        archiveIssue: this.host.archiveIssue?.(sessionId) ?? null,
        activity: this.host.activity?.(sessionId) ?? { running: false, queued: 0 },
        route: this.host.route(sessionId),
        lastUserSeq: messages.at(-1)?.seq ?? null,
      };
    } finally { observation[Symbol.dispose](); }
  }

  async reply(sessionId, request, signal) {
    const content = replyContent(request.text, request.quote);
    return this.host.reply(sessionId, content, `reply-${request.requestId}`, signal, replyMarker);
  }

  async inspect(sessionId, seq, signal) {
    const observation = await this.host.observe(sessionId, signal);
    try {
      const plan = messagePlan(observation.events, seq);
      if (plan.unsupported) throw new RecoveryError('UNSUPPORTED_CONTENT');
      const snapshot = await this.vault.capture(sessionId, plan.event, this.host.attachments, signal);
      return {
        seq, time: plan.event.time, content: snapshot.event.data.content,
        originalContent: snapshot.event.data.content,
        toolCalls: plan.toolCalls, hasPathReferences: plan.hasPathReferences,
        route: this.host.route(sessionId),
      };
    } finally { observation[Symbol.dispose](); }
  }

  async prepare(sessionId, seq, signal) {
    const observation = await this.host.observe(sessionId, signal);
    try {
      const plan = messagePlan(observation.events, seq);
      if (plan.unsupported) throw new RecoveryError('UNSUPPORTED_CONTENT');
      const snapshot = await this.vault.capture(sessionId, plan.event, this.host.attachments, signal);
      signal?.throwIfAborted();
      const operation = {
        version: 2, scope: 'same-session', token: randomUUID(), sourceSessionId: sessionId, seq,
        time: plan.event.time,
        state: 'prepared', fingerprint: plan.fingerprint, route: this.host.route(sessionId),
        toolCalls: plan.toolCalls, hasPathReferences: plan.hasPathReferences, updatedAt: Date.now(),
      };
      await this.save(operation);
      await this.indexToken(sessionId, operation.token);
      await this.vault.writeRecord('drafts', `session:${sessionId}`, { version: 1, token: operation.token });
      return { ...publicOperation(operation), content: snapshot.event.data.content, revision: 0 };
    } finally { observation[Symbol.dispose](); }
  }

  /** Remember every operation token per session so a restart can rebuild wake-ups. */
  async indexToken(sessionId, token) {
    const record = await this.vault.readRecord('drafts', `tokens:${sessionId}`);
    const previous = Array.isArray(record?.tokens) ? record.tokens : [];
    if (previous.includes(token)) return;
    await this.vault.writeRecord('drafts', `tokens:${sessionId}`, { version: 1, tokens: [...previous, token].slice(-100) });
  }

  async sessionTokens(sessionId) {
    const record = await this.vault.readRecord('drafts', `tokens:${sessionId}`);
    return Array.isArray(record?.tokens) ? record.tokens : [];
  }

  async operation(token) {
    return this.vault.readRecord('operations', token);
  }

  /**
   * One-shot resend used by the inline editor and the retry action. The
   * original message and every turn the model saw after it are retracted from
   * the derived history by one surface replacement, and the (edited) content
   * is delivered at the original position — the conversation stays in this
   * session and nothing is appended after the tail. `requestId` is the
   * operation token, so a disconnected retry reconciles instead of duplicating
   * the message.
   */
  async resend(sessionId, request, signal) {
    const token = request.requestId;
    const existing = await this.vault.readRecord('operations', token);
    if (existing) {
      if (existing.version !== 2 || existing.scope !== 'same-session') throw new RecoveryError('OPERATION_NOT_FOUND');
      if (existing.sourceSessionId !== sessionId) throw new RecoveryError('FORBIDDEN');
      if (existing.seq !== request.seq) throw new RecoveryError('BAD_SEQUENCE');
      if (existing.state === 'accepted') return this.reconcile(existing, signal);
      if (existing.state !== 'prepared') throw new RecoveryError('SEND_UNCERTAIN');
      const draft = await this.vault.readRecord('drafts', token);
      if (JSON.stringify(draft?.edits) !== JSON.stringify(request.edits)) throw new RecoveryError('REQUEST_CONFLICT');
      return this.locked(sessionId, () => this.launch(existing, request, signal));
    }
    const observation = await this.host.observe(sessionId, signal);
    let operation;
    try {
      const plan = messagePlan(observation.events, request.seq);
      if (plan.unsupported) throw new RecoveryError('UNSUPPORTED_CONTENT');
      await this.vault.capture(sessionId, plan.event, this.host.attachments, signal);
      operation = {
        version: 2, scope: 'same-session', token, sourceSessionId: sessionId, seq: request.seq,
        time: plan.event.time, state: 'prepared', mode: request.edits === undefined ? 'retry' : 'edit',
        fingerprint: plan.fingerprint, route: request.route ?? this.host.route(sessionId),
        toolCalls: plan.toolCalls, hasPathReferences: plan.hasPathReferences,
        retract: retractRange(this.host.surface(sessionId).nodes, request.seq), updatedAt: Date.now(),
      };
    } finally { observation[Symbol.dispose](); }
    return this.locked(sessionId, async () => {
      // Write the operation under the session lock so a concurrent request with
      // the same requestId can never overwrite a later accepted state.
      const stored = await this.vault.readRecord('operations', token);
      if (stored) {
        if (stored.version !== 2 || stored.scope !== 'same-session') throw new RecoveryError('OPERATION_NOT_FOUND');
        if (stored.sourceSessionId !== sessionId) throw new RecoveryError('FORBIDDEN');
        if (stored.seq !== request.seq) throw new RecoveryError('BAD_SEQUENCE');
        if (stored.state === 'accepted') return this.reconcile(stored, signal);
        if (stored.state !== 'prepared') throw new RecoveryError('SEND_UNCERTAIN');
        return this.launch(stored, request, signal);
      }
      if (request.edits !== undefined) await this.vault.writeRecord('drafts', token, { version: 1, token, edits: request.edits, revision: 1 });
      await this.save(operation);
      await this.indexToken(sessionId, token);
      try { return await this.launch(operation, request, signal); }
      catch (error) {
        // Keep an unfinished edit resumable from the history popover.
        await this.vault.writeRecord('drafts', `session:${sessionId}`, { version: 1, token }).catch(() => {});
        throw error;
      }
    });
  }

  async launch(operation, request, signal) {
    if (operation.state === 'accepted') return this.reconcile(operation, signal);
    const release = await acquireLock(this.vault.root, operation);
    try {
      const stored = await this.vault.readRecord('operations', operation.token);
      if (stored.state !== operation.state) return this.reconcile(stored, signal);
      return await this.deliverRetraction(stored, request, signal);
    } finally { await release(); }
  }

  async deliverRetraction(operation, request, signal) {
    const snapshot = await this.snapshot(operation);
    await this.vault.verify(snapshot, this.host.attachments, signal);
    const draft = await this.vault.readRecord('drafts', operation.token);
    if (request.revision !== undefined && request.revision !== (draft?.revision ?? 0)) throw new RecoveryError('DRAFT_CONFLICT');
    const content = editContent(snapshot.event.data.content, draft?.edits);
    const actualRoute = this.host.route(operation.sourceSessionId);
    if (!actualRoute || (request.route !== undefined && digest(actualRoute) !== digest(request.route))) {
      operation.error = 'MODEL_CHANGED';
      await this.save(operation);
      return publicOperation(operation);
    }
    await this.host.validateContent(content, actualRoute, signal);
    // Everything that can refuse without side effects has passed; only now may
    // the session be quiesced.
    await this.host.quiesce(operation.sourceSessionId, request.stop === true, signal);
    signal?.throwIfAborted();
    if (operation.retractEventSeq === undefined) {
      const observation = await this.host.observe(operation.sourceSessionId, signal);
      let range = operation.retract;
      try {
        if (messagePlan(observation.events, operation.seq).fingerprint !== operation.fingerprint) throw new RecoveryError('SOURCE_CHANGED');
        const nodes = this.host.surface(operation.sourceSessionId).nodes;
        // A range captured when the request arrived must still end at the live
        // surface tail; anything the user sent since would be retracted too.
        if (range === undefined) range = retractRange(nodes, operation.seq);
        else if (!retractRangeIntact(nodes, range)) {
          operation.error = 'RETRACT_STALE';
          await this.save(operation);
          throw new RecoveryError('RETRACT_STALE');
        }
      } finally { observation[Symbol.dispose](); }
      let event;
      try {
        event = this.host.appendSurface(operation.sourceSessionId, 'user/message', {
          id: retractionMessageId(operation.token), role: 'user', content, source: { kind: 'user' },
        }, retractionSurfaceOp(range));
      } catch (error) {
        // The operation stays resumable; the failure is recorded for status reads.
        operation.error = error?.code ?? 'SEND_UNCERTAIN';
        await this.save(operation);
        throw error;
      }
      operation.retract = range;
      operation.retractEventSeq = event.seq;
      await this.save(operation);
      if (!await this.host.flush(operation.sourceSessionId)) throw new RecoveryError('NO_PERSISTENCE');
    }
    operation.state = 'accepted';
    delete operation.error;
    await this.save(operation);
    this.host.followup(operation.sourceSessionId, {
      id: retractionMessageId(operation.token), role: 'user', content, source: { kind: 'user' },
    });
    if (!await this.host.flush(operation.sourceSessionId)) throw new RecoveryError('NO_PERSISTENCE');
    await this.markRetracted(operation.sourceSessionId, operation);
    return { ...publicOperation(operation), retracted: true };
  }

  /**
   * Decide, at the moment the agent loop claims the wake-up prompt, whether the
   * retraction may suppress it. The replacement must still be the model-visible
   * surface tail; anything appended since means the conversation moved on and
   * the prompt is delivered as an ordinary message instead.
   */
  async landRetraction(sessionId, token, signal) {
    const operation = await this.vault.readRecord('operations', token);
    if (!operation || operation.version !== 2 || operation.scope !== 'same-session') return 'deliver';
    if (operation.sourceSessionId !== sessionId || operation.retractEventSeq === undefined) return 'deliver';
    const surface = this.host.surface(sessionId);
    const index = surface.nodes.indexOf(operation.retractEventSeq);
    if (index < 0 || index !== surface.nodes.length - 1) {
      // The conversation moved on after the retraction landed; delivering the
      // prompt as an ordinary message keeps history consistent.
      if (operation.retractSkipped === undefined) {
        operation.retractSkipped = 'STALE';
        await this.save(operation);
      }
      return 'deliver';
    }
    const event = surface.eventAt(operation.retractEventSeq);
    if (!event || event.type !== 'user/message' || event.data?.id !== retractionMessageId(token)) return 'deliver';
    signal?.throwIfAborted();
    if (operation.state !== 'accepted') {
      operation.state = 'accepted';
      delete operation.error;
      await this.save(operation);
      try { await this.host.flush(sessionId); } catch { /* the in-memory log already holds the replacement */ }
    }
    return 'suppress';
  }

  async markRetracted(sessionId, operation) {
    const record = await this.vault.readRecord('drafts', `marks:${sessionId}`);
    const previous = Array.isArray(record?.entries) ? record.entries : [];
    const entries = [...previous.filter((entry) => entry.seq !== operation.seq), {
      seq: operation.seq, mode: operation.mode, eventSeq: operation.retractEventSeq, time: Date.now(),
    }].slice(-200);
    await this.vault.writeRecord('drafts', `marks:${sessionId}`, { version: 1, entries });
  }

  async marks(sessionId) {
    const record = await this.vault.readRecord('drafts', `marks:${sessionId}`);
    return { retracted: Array.isArray(record?.entries) ? record.entries : [] };
  }

  async retryTurn(sessionId, request, signal) {
    const observation = await this.host.observe(sessionId, signal);
    let seq;
    try {
      const events = observation.events;
      let index = -1;
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'assistant/message' && events[i].data?.message?.id === request.messageId) { index = i; break; }
      }
      if (index < 0) throw new RecoveryError('MESSAGE_NOT_FOUND');
      for (let i = index - 1; i >= 0; i--) {
        if (isAppendUserMessage(events[i])) { seq = events[i].seq; break; }
      }
      if (seq === undefined) throw new RecoveryError('MESSAGE_NOT_FOUND');
    } finally { observation[Symbol.dispose](); }
    return this.resend(sessionId, { action: 'resend', seq, requestId: request.requestId, ...(request.route === undefined ? {} : { route: request.route }) }, signal);
  }

  async snapshot(operation) {
    const snapshot = await this.vault.readRecord('snapshots', `${operation.sourceSessionId}:${operation.seq}`);
    if (!snapshot || digest(snapshot.event) !== operation.fingerprint) throw new RecoveryError('BACKUP_INVALID');
    return snapshot;
  }

  async loadDraft(operation) {
    const snapshot = await this.snapshot(operation);
    const draft = await this.vault.readRecord('drafts', operation.token);
    return {
      ...publicOperation(operation), content: editContent(snapshot.event.data.content, draft?.edits),
      originalContent: snapshot.event.data.content, revision: draft?.revision ?? 0,
    };
  }

  async save(operation) {
    operation.updatedAt = Date.now();
    await this.vault.writeRecord('operations', operation.token, operation);
  }

  async reconcile(operation, signal) {
    if (['sending', 'uncertain'].includes(operation.state)) {
      const admitted = await this.host.hasMessage(operation.sourceSessionId, `rollback-${operation.token}`, signal);
      // A message visible only in memory is not proof of delivery: durability decides `accepted`.
      if (admitted && await this.host.flush(operation.sourceSessionId)) {
        operation.state = 'accepted';
        delete operation.error;
        await this.save(operation);
      }
    }
    if (operation.retractEventSeq !== undefined && ['prepared', 'ready'].includes(operation.state)) {
      // The retraction landed but the operation never reached `accepted` — a
      // crash or a refused flush barrier. Promote it and re-queue the prompt.
      operation.state = 'accepted';
      delete operation.error;
      await this.save(operation);
    }
    if (operation.state === 'accepted' && operation.retractEventSeq !== undefined) {
      // A crash between landing the retraction and queueing the wake-up prompt
      // leaves a clean history with no answer: re-issue the prompt once.
      await this.requeueRetraction(operation, signal);
    }
    return publicOperation(operation);
  }

  async requeueRetraction(operation, signal) {
    let surface;
    try { surface = this.host.surface(operation.sourceSessionId); }
    catch { return; }
    const nodes = surface.nodes;
    if (nodes.indexOf(operation.retractEventSeq) !== nodes.length - 1) return;
    const messageId = retractionMessageId(operation.token);
    if (typeof this.host.pending === 'function' && this.host.pending(operation.sourceSessionId, messageId)) return;
    let content;
    try {
      const snapshot = await this.snapshot(operation);
      const draft = await this.vault.readRecord('drafts', operation.token);
      content = editContent(snapshot.event.data.content, draft?.edits);
    } catch { return; }
    this.host.followup(operation.sourceSessionId, { id: messageId, role: 'user', content, source: { kind: 'user' } });
    try { await this.host.flush(operation.sourceSessionId); } catch { /* the in-memory log already holds the replacement */ }
    signal?.throwIfAborted();
  }

  async execute(operation, request, signal) {
    if (['accepted', 'sending', 'uncertain'].includes(operation.state)) return this.reconcile(operation, signal);
    if (operation.state === 'prepared' && request.mode === 'send') throw new RecoveryError('OPEN_EDITOR_FIRST');
    const release = await acquireLock(this.vault.root, operation);
    try {
      const stored = await this.vault.readRecord('operations', operation.token);
      if (stored.state !== operation.state) return this.reconcile(stored, signal);
      if (request.mode === 'edit') {
        if (operation.state !== 'prepared') return publicOperation(operation);
        const observation = await this.host.observe(operation.sourceSessionId, signal);
        try {
          if (messagePlan(observation.events, operation.seq).fingerprint !== operation.fingerprint) throw new RecoveryError('SOURCE_CHANGED');
        } finally { observation[Symbol.dispose](); }
        operation.state = 'ready';
        operation.mode = 'edit';
        delete operation.error;
        await this.save(operation);
        return publicOperation(operation);
      }
      // Every send retracts the original message and its successor turns first,
      // whichever entry path prepared the operation.
      if (stored.mode === undefined) { stored.mode = request.mode === 'send' ? 'edit' : request.mode; await this.save(stored); }
      return await this.deliverRetraction(stored, request, signal);
    } finally {
      await release();
    }
  }

  async dispose() {
    this.stopped = true;
    await Promise.allSettled(this.jobs.values());
  }
}

async function acquireLock(root, operation) {
  const directory = join(root, 'locks');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new RecoveryError('RECOVERY_LOCKED');
  const path = join(directory, digest(operation.sourceSessionId));
  const temporary = join(directory, `owner-${randomUUID()}.tmp`);
  const owner = JSON.stringify({ version: 2, pid: process.pid, token: operation.token });
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try { await handle.writeFile(owner); await handle.sync(); }
    finally { await handle.close(); }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await link(temporary, path);
        return async () => {
          if (await readFile(path, 'utf8') !== owner) throw new RecoveryError('RECOVERY_LOCKED');
          await unlink(path);
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new RecoveryError('RECOVERY_LOCKED');
        const text = await readFile(path, 'utf8');
        let previous;
        try { previous = JSON.parse(text); } catch { throw new RecoveryError('RECOVERY_LOCKED'); }
        if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0 || previous.pid > 2147483647) throw new RecoveryError('RECOVERY_LOCKED');
        try { process.kill(previous.pid, 0); throw new RecoveryError('RECOVERY_LOCKED'); }
        catch (cause) { if (cause.code !== 'ESRCH') throw new RecoveryError('RECOVERY_LOCKED'); }
        // A profile is single-writer; never steal a lock owned by a living process.
        if (await readFile(path, 'utf8') !== text) throw new RecoveryError('RECOVERY_LOCKED');
        await unlink(path);
      }
    }
    throw new RecoveryError('RECOVERY_LOCKED');
  } finally { await unlink(temporary); }
}
