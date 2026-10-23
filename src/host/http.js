import { randomBytes } from 'node:crypto';

const PREFIX = '/content-rollback';
const MAX_BODY = 2 * 1024 * 1024;

export const createNonce = () => randomBytes(24).toString('hex');

/** Same-origin UI transport. The nonce prevents other scripts on the same origin from driving writes. */
export function registerHttp(ctx, dispatch, nonce) {
  const server = ctx.webServer;
  if (!server?.register) return () => {};
  const disposers = [];
  const route = (name, mutating, handler) => {
    disposers.push(server.register({
      kind: 'exact',
      path: `${PREFIX}/${name}`,
      handler: async (req, res) => {
        if (deny(req, res, mutating, nonce)) return;
        try { await handler(req, res); }
        catch (error) {
          ctx.logger?.warn?.(`content-rollback: HTTP ${name} failed: ${error?.message ?? error}`);
          send(res, 500, { ok: false, error: { code: error?.code ?? 'RECOVERY_FAILED', message: 'Internal recovery failure' } });
        }
      },
    }));
  };
  route('nonce', false, (_req, res) => send(res, 200, { nonce }));
  route('call', true, async (req, res) => {
    const payload = await readJson(req);
    if (!payload || typeof payload.sessionId !== 'string' || typeof payload.request !== 'object' || payload.request === null || Array.isArray(payload.request)) {
      return send(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: 'sessionId and request are required' } });
    }
    if (!ctx.remoteAccess?.allows?.({ kind: 'session', id: payload.sessionId })) {
      return send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'session not accessible' } });
    }
    send(res, 200, await dispatch(payload.sessionId, payload.request, undefined));
  });
  return () => { for (const dispose of disposers) dispose(); };
}

export function deny(req, res, mutating, nonce) {
  if (header(req, 'sec-fetch-site') === 'cross-site') { send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'cross-site' } }); return true; }
  const origin = header(req, 'origin') ?? header(req, 'referer');
  if (origin) {
    try {
      const host = header(req, 'host') ?? '';
      if (host && new URL(origin).host !== host) { send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'cross-origin' } }); return true; }
    } catch { send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'bad-origin' } }); return true; }
  }
  if (mutating) {
    if (req.method !== 'POST') { send(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' } }); return true; }
    if (header(req, 'x-dcr-nonce') !== nonce) { send(res, 403, { ok: false, error: { code: 'FORBIDDEN', message: 'invalid nonce' } }); return true; }
  }
  return false;
}

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-length', String(Buffer.byteLength(body)));
  res.end(body);
}

async function readJson(req) {
  if (!(header(req, 'content-type') ?? '').includes('application/json')) return null;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    bytes += buffer.length;
    if (bytes > MAX_BODY) return null;
    chunks.push(buffer);
  }
  if (bytes === 0) return null;
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
