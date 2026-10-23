import test from 'node:test';
import assert from 'node:assert/strict';
import { callRecovery, resetRecoveryTransport } from '../src/client/transport.js';

test.beforeEach(() => resetRecoveryTransport());

const json = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });

function httpMock({ nonce = 'n1', call = () => json({ ok: true, value: { saved: true } }), nonceStatus = 200 } = {}) {
  const calls = [];
  let issued = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/nonce')) return nonceStatus === 200 ? json({ nonce: `${nonce}-${++issued}` }) : json({ error: 'nope' }, nonceStatus);
    return call(init);
  };
  return { fetchImpl, calls };
}

test('HTTP transport sends the session-bound request with a nonce', async () => {
  const { fetchImpl, calls } = httpMock();
  const value = await callRecovery(fetchImpl, null, 'session-A', { action: 'list' });
  assert.deepEqual(value, { saved: true });
  const call = calls.find((entry) => entry.url.endsWith('/call'));
  assert.equal(call.init.headers['x-dcr-nonce'], 'n1-1');
  assert.deepEqual(JSON.parse(call.init.body), { sessionId: 'session-A', request: { action: 'list' } });
  assert.equal(call.init.credentials, 'same-origin');
});

test('the nonce is cached, and a rejected nonce is refreshed once', async () => {
  let attempts = 0;
  const { fetchImpl, calls } = httpMock({ call: () => (++attempts === 1 ? json({ ok: false }, 403) : json({ ok: true, value: { accepted: true } })) });
  await callRecovery(fetchImpl, null, 's', { action: 'list' });
  await callRecovery(fetchImpl, null, 's', { action: 'list' });
  assert.equal(calls.filter((entry) => entry.url.endsWith('/nonce')).length, 2);
  assert.equal(calls.filter((entry) => entry.url.endsWith('/call')).length, 3);
});

test('profiles without the HTTP route fall back to the command transport', async () => {
  const { fetchImpl } = httpMock({ nonceStatus: 404 });
  let received;
  const remote = { commands: { async execute(...args) { received = args; return { ok: true, value: { result: { kind: 'success', text: '{"ok":true,"value":{"items":[]}}' } } }; } } };
  assert.deepEqual(await callRecovery(fetchImpl, remote, 'session-A', { action: 'list' }), { items: [] });
  assert.equal(received[0], 'session-A');
  assert.deepEqual(received[2], []);
});

test('domain failures are surfaced without falling back or printing internal stacks', async () => {
  const { fetchImpl } = httpMock({ call: () => json({ ok: false, error: { code: 'FORBIDDEN', message: 'denied' } }) });
  await assert.rejects(() => callRecovery(fetchImpl, null, 's', { action: 'list' }), { code: 'FORBIDDEN', message: 'denied' });
});
