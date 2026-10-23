import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Vault } from './src/host/vault.js';
import { RecoveryService } from './src/host/service.js';
import { RecoveryError, digest, isUserMessage } from './src/host/domain.js';

export const inject = ['commands', 'sessionQuery', 'sessions', 'agents', 'attachments', 'sessionProjections', 'agentDefaultModel', 'llm', 'remoteAccess'];

export async function apply(ctx) {
  const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'));
  const profile = digest(process.env.DSH_PROFILE_DIR || process.env.DSH_PROFILE || 'default');
  const vault = new Vault(join(home, 'content-rollback', 'v1', profile));
  await vault.init();
  const archiveIssues = new Map();
  const requireAgent = (id) => {
    const agent = ctx.agents.get(id);
    if (!agent) throw new RecoveryError('SESSION_NOT_ACTIVE');
    return agent;
  };
  const host = {
    attachments: ctx.attachments,
    archiveIssue: (id) => archiveIssues.get(id) ?? null,
    allowed: (id) => ctx.remoteAccess.allows({ kind: 'session', id }),
    observe: (id, signal) => ctx.sessionQuery.observeSession(id, { signal, projectionMode: 'none' }),
    route(id) {
      const agent = requireAgent(id);
      const selection = ctx.sessionProjections.snapshot(agent.session, ['modelSelection']).values.modelSelection;
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
    async cursor(id, signal) {
      const observation = await host.observe(id, signal);
      try { return (observation.events.at(-1)?.seq ?? -1) + 1; }
      finally { observation[Symbol.dispose](); }
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
    send(id, content, messageId, expectedRoute, expectedCursor) {
      if (!host.allowed(id)) throw new RecoveryError('FORBIDDEN');
      const agent = requireAgent(id);
      if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length || agent.session.seq !== expectedCursor) throw new RecoveryError('SESSION_CHANGED');
      if (digest(host.route(id)) !== digest(expectedRoute)) throw new RecoveryError('MODEL_CHANGED');
      agent.followup({ id: messageId, role: 'user', content, source: { kind: 'user' } });
    },
    async hasMessage(id, messageId, signal) {
      const observation = await host.observe(id, signal);
      try {
        if (observation.events.some((event) => event.type === 'user/message' && event.data.id === messageId)) return true;
        const agent = ctx.agents.get(id);
        return agent ? [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((message) => message.id === messageId) : false;
      } finally { observation[Symbol.dispose](); }
    },
  };
  const api = new RecoveryService(host, vault);
  const dispatch = async (sessionId, request, signal) => {
    try { return { ok: true, value: await api.request(sessionId, request, signal) }; }
    catch (error) { return { ok: false, error: { code: error.code ?? 'RECOVERY_FAILED', message: error.message } }; }
  };
  ctx.effect(() => ctx.commands.register({
    definitionId: 'content-rollback', name: 'rollback',
    description: 'Recover and resend content in this same DSH conversation / 当前会话内找回并重发（不新建会话，不撤销工具副作用）',
    input: { hint: 'JSON action: list, prepare, execute, status, load-draft, save-draft' },
    recordInput: false,
    async handler({ agent, rawInput, signal }) {
      let request;
      try { request = JSON.parse(rawInput || '{"action":"list"}'); }
      catch { return { kind: 'error', text: 'Invalid recovery request / 回溯请求不是有效 JSON' }; }
      return { kind: 'success', text: JSON.stringify(await dispatch(agent.id, request, signal)) };
    },
  }));
  ctx.on('session/event', (session, event) => {
    if (!isUserMessage(event) || api.stopped) return;
    void api.locked(`capture:${session.id}`, async () => {
      try {
        await vault.capture(session.id, event, ctx.attachments);
        archiveIssues.delete(session.id);
      } catch (error) {
        archiveIssues.set(session.id, error.code ?? 'BACKUP_FAILED');
        ctx.logger.warn(`content-rollback: backup failed (${error.code ?? 'BACKUP_FAILED'})`);
      }
    });
  });
  const agentDisposers = new Map();
  const installTool = (agent) => {
    if (api.stopped || agentDisposers.has(agent.id)) return;
    const fiber = agent.ctx.inject(['tools'], (scoped) => {
      scoped.effect(() => scoped.tools.register({
        name: 'conversation_recovery',
        description: 'Recover an earlier user message from the local backup and resend it in THIS SAME session, either unchanged or after the user edits the text. Attachments keep their sent versions. This never creates or switches sessions, and it never reverts files or external tool side effects. Never execute it without the user asking for recovery.',
        parameters: { type: 'object', properties: {
          action: { type: 'string', enum: ['list', 'prepare', 'execute', 'status', 'load-draft', 'save-draft'] },
          seq: { type: 'integer' }, token: { type: 'string' }, mode: { type: 'string', enum: ['edit', 'retry', 'send'] },
          before: { type: 'integer' }, edits: { type: 'array', items: { type: 'string' } }, revision: { type: 'integer' },
          route: { type: 'object', properties: { provider: { type: 'string' }, model: { type: 'string' }, reasoningEffort: { type: 'string' } }, required: ['provider', 'model'] },
        }, required: ['action'], additionalProperties: false },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async (args, exec) => JSON.stringify(await dispatch(agent.id, args, exec.signal)),
      }));
    });
    agentDisposers.set(agent.id, () => fiber.dispose());
  };
  ctx.on('agent/created', installTool);
  ctx.on('agent/disposed', async (agent) => {
    const dispose = agentDisposers.get(agent.id);
    agentDisposers.delete(agent.id);
    await dispose?.();
  });
  for (const agent of ctx.agents.list()) installTool(agent);
  ctx.effect(() => async () => {
    await api.dispose();
    await Promise.all([...agentDisposers.values()].map((dispose) => dispose()));
    agentDisposers.clear();
  });
}
