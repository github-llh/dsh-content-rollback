import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';

test('host registers one scoped tool per agent and disposes Cordis Fiber objects correctly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-rollback-host-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = root;
  t.after(async () => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; await rm(root, { recursive: true, force: true }); });
  const effects = [];
  const listeners = new Map();
  const tools = [];
  let disposed = 0;
  let command;
  function makeAgent(id) {
    return {
      id, session: { id },
      ctx: { inject(dependencies, callback) {
        assert.deepEqual(dependencies, ['tools']);
        const cleanups = [];
        callback({ effect(fn) { cleanups.push(fn()); }, tools: { register(definition) { tools.push(definition); return () => {}; } } });
        return { async dispose() { disposed++; for (const cleanup of cleanups) await cleanup(); } };
      } },
    };
  }
  const agent = makeAgent('source');
  const ctx = {
    commands: { register(definition) { command = definition; return () => {}; } },
    sessions: {}, sessionController: {}, attachments: {},
    agents: { list: () => [agent], get: () => agent },
    sessionQuery: { observeSession: async () => ({ events: [], [Symbol.dispose]() {} }) },
    sessionProjections: { snapshot: () => ({ values: {} }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    remoteAccess: { allows: () => true }, llm: {},
    logger: { warn() {} },
    effect(fn) { const cleanup = fn(); effects.push(cleanup); return cleanup; },
    on(name, listener) { listeners.set(name, listener); effects.push(() => listeners.delete(name)); },
  };
  await apply(ctx);
  assert.equal(tools.length, 1);
  assert.equal(command.name, 'rollback');
  const value = await command.handler({ agent, rawInput: '', signal: new AbortController().signal });
  assert.equal(JSON.parse(value.text).ok, true);
  await listeners.get('agent/disposed')(agent);
  assert.equal(disposed, 1);
  listeners.get('agent/created')(makeAgent('second'));
  assert.equal(tools.length, 2);
  for (const cleanup of effects.reverse()) await cleanup();
  assert.equal(disposed, 2);
});
