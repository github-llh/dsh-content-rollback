import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Vault } from './src/host/vault.js';
import { RecoveryService } from './src/host/service.js';
import { createNonce, registerHttp } from './src/host/http.js';
import { RecoveryError, digest, isUserMessage } from './src/host/domain.js';

export const inject = ['commands', 'sessionQuery', 'sessions', 'agents', 'attachments', 'sessionProjections', 'agentDefaultModel', 'llm', 'remoteAccess'];

export async function apply(ctx) {
  const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'));
  const profile = digest(process.env.DSH_PROFILE_DIR || process.env.DSH_PROFILE || 'default');
  const vault = new Vault(join(home, 'content-rollback', 'v1', profile));
  let storageError = null;
  try { await vault.init(); }
  catch (error) {
    storageError = error;
    ctx.logger.error(`content-rollback: local backup storage is unavailable: ${error.message}`);
  }
  const archiveIssues = new Map();
  const requireAgent = (id) => {
    const agent = ctx.agents.get(id);
    if (!agent) throw new RecoveryError('SESSION_NOT_ACTIVE');
    return agent;
  };
  /** Wake-up prompts whose retraction must suppress them at claim time. */
  const retractionWakeups = new Map();
  const wakeupKey = (messageId) => {
    const match = /^rollback-([0-9a-f-]{36})$/.exec(messageId ?? '');
    return match ? match[1] : null;
  };
  const rememberWakeup = (id, messageId) => {
    const token = wakeupKey(messageId);
    if (!token) return;
    let wakeups = retractionWakeups.get(id);
    if (!wakeups) { wakeups = new Map(); retractionWakeups.set(id, wakeups); }
    wakeups.set(messageId, token);
  };
  const host = {
    attachments: ctx.attachments,
    archiveIssue: (id) => archiveIssues.get(id) ?? null,
    allowed: (id) => ctx.remoteAccess.allows({ kind: 'session', id }),
    observe: (id, signal) => ctx.sessionQuery.observeSession(id, { signal, projectionMode: 'none' }),
    surface(id) {
      const agent = requireAgent(id);
      const session = agent.session;
      return { nodes: [...session.surface.nodes], eventAt: (seq) => session.eventAt(seq) };
    },
    appendSurface(id, type, data, options) {
      if (!host.allowed(id)) throw new RecoveryError('FORBIDDEN');
      return requireAgent(id).session.append(type, data, options);
    },
    followup(id, message) {
      if (!host.allowed(id)) throw new RecoveryError('FORBIDDEN');
      requireAgent(id).followup(message);
      rememberWakeup(id, message.id);
    },
    pending(id, messageId) {
      const agent = ctx.agents.get(id);
      if (!agent) return false;
      return [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((message) => message.id === messageId);
    },
    route(id) {
      const agent = ctx.agents.get(id);
      const selection = agent ? ctx.sessionProjections.snapshot(agent.session, ['modelSelection']).values.modelSelection : null;
      return selection?.next ?? selection?.lastUsed ?? ctx.agentDefaultModel.currentSelection();
    },
    async quiesce(id, stop, signal) {
      const agent = requireAgent(id);
      if (agent.inbox.nextTurn.length || agent.inbox.nextStep.length) throw new RecoveryError('PENDING_QUEUE');
      if (agent.status === 'running') {
        if (!stop) throw new RecoveryError('SESSION_RUNNING');
        agent.cancel({ kind: 'user' }, { keepInbox: true });
        let timer;
        try {
          await Promise.race([
            agent.whenIdle(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new RecoveryError('STOP_TIMEOUT')), 15000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
      signal?.throwIfAborted();
      if (ctx.agents.get(id) !== agent || agent.status !== 'idle') throw new RecoveryError('SESSION_CHANGED');
      if (agent.inbox.nextTurn.length || agent.inbox.nextStep.length) throw new RecoveryError('PENDING_QUEUE');
    },
    activity(id) {
      const agent = ctx.agents.get(id);
      return agent ? { running: agent.status === 'running', queued: agent.inbox.nextTurn.length + agent.inbox.nextStep.length } : { running: false, queued: 0 };
    },
    flush: (id) => ctx.sessions.flush(requireAgent(id).session),
    async validateContent(content, route, signal) {
      await ctx.llm.resolveCallConfig(route);
      if (content.some((part) => part.type === 'image')) {
        const model = await ctx.llm.resolveModelInfo(route.provider, route.model);
        if (model.inputModalities && !model.inputModalities.includes('image')) throw new RecoveryError('MODEL_NO_IMAGES');
      }
      signal?.throwIfAborted();
    },
    async hasMessage(id, messageId, signal) {
      const observation = await host.observe(id, signal);
      try {
        if (observation.events.some((event) => event.type === 'user/message' && event.data.id === messageId)) return true;
        const agent = ctx.agents.get(id);
        return agent ? [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((message) => message.id === messageId) : false;
      } finally { observation[Symbol.dispose](); }
    },
    async reply(id, content, messageId, signal, marker) {
      if (!host.allowed(id)) throw new RecoveryError('FORBIDDEN');
      const agent = requireAgent(id);
      if (await host.hasMessage(id, messageId, signal)) {
        if (!await ctx.sessions.flush(agent.session)) throw new RecoveryError('NO_PERSISTENCE');
        return { accepted: true, messageId, duplicate: true };
      }
      // The marker lets the UI render the quote as a card; the blockquoted
      // content stays exactly what the model reads.
      agent.followup({ id: messageId, role: 'user', content, source: { kind: 'user', ...(marker === undefined ? {} : { 'content-rollback': marker }) } });
      if (!await ctx.sessions.flush(agent.session)) throw new RecoveryError('NO_PERSISTENCE');
      return { accepted: true, messageId };
    },
  };
  const api = new RecoveryService(host, vault);
  const nonce = createNonce();
  // Land the retraction at the exact moment the loop claims the wake-up prompt:
  // the replacement already carries the content at the original surface
  // position, so the claimed prompt must not append a second copy.
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next();
    if (decision?.kind !== 'enter') return decision;
    const wakeups = retractionWakeups.get(agent.id);
    if (!wakeups?.size) return decision;
    const hit = decision.messages.find((message) => wakeups.has(message.id));
    if (!hit) return decision;
    let outcome = 'deliver';
    try { outcome = await api.landRetraction(agent.id, wakeups.get(hit.id), signal); }
    catch (error) { ctx.logger.warn(`content-rollback: retraction landing failed: ${error?.message ?? error}`); }
    if (outcome !== 'suppress') {
      // The conversation moved on after the retraction landed: the prompt is
      // delivered as an ordinary message rather than retracting newer history.
      ctx.logger.warn(`content-rollback: retraction for message ${hit.id} was not applied; history was left untouched`);
      return decision;
    }
    return {
      ...decision,
      messages: decision.messages.map((message) => message.id === hit.id
        ? { ...message, source: { ...message.source, kind: 'runtime-context' } }
        : message),
    };
  });
  const dispatch = async (sessionId, request, signal) => {
    if (storageError) {
      // A transient disk/permission failure must not force a DSH restart.
      try { await vault.init(); storageError = null; } catch (error) { storageError = error; }
      if (storageError) return { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: storageError.message } };
    }
    try { return { ok: true, value: await api.request(sessionId, request, signal) }; }
    catch (error) {
      // Expected domain failures are user-facing; unexpected ones must still be diagnosable.
      if (!(error instanceof RecoveryError)) ctx.logger.warn(`content-rollback: ${request.action} failed: ${error?.stack ?? error}`);
      return { ok: false, error: { code: error.code ?? 'RECOVERY_FAILED', message: error.message } };
    }
  };
  // UI actions use a same-origin HTTP route so they do not append command cards to the transcript.
  ctx.effect(() => {
    const fiber = ctx.inject(['webServer'], (scoped) => registerHttp(scoped, dispatch, nonce));
    return () => fiber.dispose();
  });
  ctx.effect(() => ctx.commands.register({
    definitionId: 'content-rollback', name: 'rollback',
    description: 'Recover and resend content in this same DSH conversation / 当前会话内找回并重发（不新建会话，不撤销工具副作用）',
    input: { hint: 'JSON action: list, inspect, resend, retry-turn, reply, prepare, execute, status, load-draft, save-draft, marks' },
    recordInput: false,
    async handler({ agent, rawInput, signal }) {
      let request;
      try { request = JSON.parse(rawInput || '{"action":"list"}'); }
      catch { return { kind: 'error', text: 'Invalid recovery request / 回溯请求不是有效 JSON' }; }
      return { kind: 'success', text: JSON.stringify(await dispatch(agent.id, request, signal)) };
    },
  }));
  ctx.on('session/event', (session, event) => {
    // Replacement events (retractions) are not new user input: they re-position
    // content the capture already holds, so they must not create a backup.
    if (!isUserMessage(event) || event.surfaceOp !== 'append' || api.stopped || storageError) return;
    // The capture must never surface as an unhandled rejection: a failed backup
    // is reported through `archiveIssue`, never by crashing the host process.
    void api.locked(`capture:${session.id}`, async () => {
      try {
        await vault.capture(session.id, event, ctx.attachments);
        archiveIssues.delete(session.id);
      } catch (error) {
        archiveIssues.set(session.id, error.code ?? 'BACKUP_FAILED');
        ctx.logger.warn(`content-rollback: backup failed (${error.code ?? 'BACKUP_FAILED'})`);
      }
    }).catch((error) => {
      ctx.logger.warn(`content-rollback: backup bookkeeping failed (${error?.code ?? error?.message ?? error})`);
    });
  });
  const agentDisposers = new Map();
  const installTool = (agent) => {
    if (api.stopped || agentDisposers.has(agent.id)) return;
    const fiber = agent.ctx.inject(['tools'], (scoped) => {
      scoped.effect(() => scoped.tools.register({
        name: 'conversation_recovery',
        description: 'Recover an earlier user message from the local backup and resend it in THIS SAME session, either unchanged or after the user edits the text; retry the user message behind a completed assistant answer; or add a reply that quotes text the user selected. Attachments keep their sent versions. This never creates or switches sessions, and it never reverts files or external tool side effects. Never execute it without the user asking for recovery, a retry, or the quoted reply.',
        parameters: { type: 'object', properties: {
          action: { type: 'string', enum: ['list', 'inspect', 'resend', 'retry-turn', 'prepare', 'execute', 'status', 'load-draft', 'save-draft', 'reply', 'marks'] },
          seq: { type: 'integer' }, token: { type: 'string' }, mode: { type: 'string', enum: ['edit', 'retry', 'send'] },
          before: { type: 'integer' }, edits: { type: 'array', items: { type: 'string' } }, revision: { type: 'integer' },
          messageId: { type: 'string', description: 'Assistant message id for action=retry-turn' },
          text: { type: 'string', description: 'Reply body for action=reply' },
          quote: { type: 'string', description: 'Text the user selected, quoted in action=reply' },
          requestId: { type: 'string', description: 'UUID that makes action=reply/resend/retry-turn idempotent' },
          stop: { type: 'boolean', description: 'Stop the running turn before resending' },
          route: { type: 'object', properties: { provider: { type: 'string' }, model: { type: 'string' }, reasoningEffort: { type: 'string' } }, required: ['provider', 'model'] },
        }, required: ['action'], additionalProperties: false },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async (args, exec) => JSON.stringify(await dispatch(agent.id, args, exec.signal)),
      }));
    });
    agentDisposers.set(agent.id, () => fiber.dispose());
  };
  /**
   * Rebuild wake-up registrations after a restart: a crash between queueing
   * the prompt and the loop claiming it leaves the message pending, and only a
   * registered wake-up suppresses it when the driver finally drains the inbox.
   */
  const restoreWakeups = async (agent) => {
    if (api.stopped || storageError || retractionWakeups.has(agent.id)) return;
    let tokens;
    try { tokens = await api.sessionTokens(agent.id); }
    catch (error) { ctx.logger.warn(`content-rollback: wake-up restore failed: ${error?.message ?? error}`); return; }
    for (const token of tokens) {
      let operation;
      try { operation = await api.operation(token); }
      catch { continue; }
      if (operation?.retract !== undefined) rememberWakeup(agent.id, `rollback-${token}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => {
    if (agent) { installTool(agent); void restoreWakeups(agent); }
  });
  ctx.on('agent/disposed', async ({ agent }) => {
    const dispose = agentDisposers.get(agent?.id);
    agentDisposers.delete(agent?.id);
    retractionWakeups.delete(agent?.id);
    await dispose?.();
  });
  for (const agent of ctx.agents.list()) { installTool(agent); void restoreWakeups(agent); }
  ctx.effect(() => async () => {
    await api.dispose();
    await Promise.all([...agentDisposers.values()].map((dispose) => dispose()));
    agentDisposers.clear();
  });
}
