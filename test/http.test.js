import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHttp } from '../src/host/http.js';

function harness({ allows = () => true } = {}) {
  const routes = new Map();
  const ctx = {
    webServer: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    remoteAccess: { allows },
    logger: { warn() {} },
  };
  const calls = [];
  const dispose = registerHttp(ctx, async (sessionId, request, signal) => {
    calls.push({ sessionId, request, signal });
    return { ok: true, value: { accepted: true } };
  }, 'nonce-1');
  return { routes, calls, dispose };
}

function request({ method = 'POST', headers = {}, body = '', url = '/content-rollback/call' } = {}) {
  return {
    method, headers, url,
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body, 'utf8'); },
  };
}

function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}

const jsonHeaders = (extra = {}) => ({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'origin': 'http://127.0.0.1:3080', host: '127.0.0.1:3080', ...extra });

test('registers same-origin nonce and call routes', async () => {
  const { routes, calls, dispose } = harness();
  assert.deepEqual([...routes.keys()].sort(), ['/content-rollback/call', '/content-rollback/nonce']);
  const nonce = response();
  await routes.get('/content-rollback/nonce').handler(request({ method: 'GET', headers: jsonHeaders() }), nonce);
  assert.equal(JSON.parse(nonce.body).nonce, 'nonce-1');
  const call = response();
  await routes.get('/content-rollback/call').handler(request({
    headers: jsonHeaders({ 'x-dcr-nonce': 'nonce-1' }),
    body: JSON.stringify({ sessionId: 'session-A', request: { action: 'list' } }),
  }), call);
  assert.equal(call.statusCode, 200);
  assert.deepEqual(JSON.parse(call.body), { ok: true, value: { accepted: true } });
  assert.deepEqual(calls, [{ sessionId: 'session-A', request: { action: 'list' }, signal: undefined }]);
  dispose();
  assert.equal(routes.size, 0);
});

test('rejects cross-site, cross-origin, missing nonce and non-POST writes', async () => {
  const { routes } = harness();
  for (const [label, options, status] of [
    ['cross-site', { headers: jsonHeaders({ 'sec-fetch-site': 'cross-site', 'x-dcr-nonce': 'nonce-1' }), body: '{}' }, 403],
    ['cross-origin', { headers: jsonHeaders({ origin: 'https://evil.example', 'x-dcr-nonce': 'nonce-1' }), body: '{}' }, 403],
    ['missing nonce', { headers: jsonHeaders(), body: '{}' }, 403],
    ['wrong method', { method: 'GET', headers: jsonHeaders({ 'x-dcr-nonce': 'nonce-1' }) }, 405],
  ]) {
    const res = response();
    await routes.get('/content-rollback/call').handler(request(options), res);
    assert.equal(res.statusCode, status, label);
  }
});

test('requires an accessible session and a bounded JSON body', async () => {
  const { routes, calls } = harness({ allows: () => false });
  const forbidden = response();
  await routes.get('/content-rollback/call').handler(request({
    headers: jsonHeaders({ 'x-dcr-nonce': 'nonce-1' }),
    body: JSON.stringify({ sessionId: 'other', request: { action: 'list' } }),
  }), forbidden);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(calls.length, 0);

  const invalid = response();
  await routes.get('/content-rollback/call').handler(request({
    headers: jsonHeaders({ 'x-dcr-nonce': 'nonce-1', 'content-type': 'text/plain' }),
    body: 'not json',
  }), invalid);
  assert.equal(invalid.statusCode, 400);
});
