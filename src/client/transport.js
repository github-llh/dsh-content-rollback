const BASE = '/content-rollback';
let nonce = null;
let noncePromise = null;

export function resetRecoveryTransport() {
  nonce = null;
  noncePromise = null;
}

function failure(code, message) {
  return Object.assign(new Error(message || code), { code });
}

async function getNonce(fetchImpl) {
  if (nonce) return nonce;
  if (!noncePromise) {
    noncePromise = fetchImpl(`${BASE}/nonce`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw Object.assign(new Error('http-unavailable'), { fallback: true });
        const value = await response.json();
        if (!value || typeof value.nonce !== 'string') throw Object.assign(new Error('http-unavailable'), { fallback: true });
        nonce = value.nonce;
        return nonce;
      })
      .catch((error) => { noncePromise = null; throw error; });
  }
  return noncePromise;
}

async function httpCall(fetchImpl, sessionId, request, signal) {
  const send = async () => {
    const token = await getNonce(fetchImpl);
    try {
      return await fetchImpl(`${BASE}/call`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dcr-nonce': token },
        body: JSON.stringify({ sessionId, request }),
        signal,
      });
    } catch (error) {
      throw Object.assign(new Error(error?.message || 'http-unavailable'), { fallback: true });
    }
  };
  let response = await send();
  if (response.status === 403) {
    nonce = null;
    noncePromise = null;
    response = await send();
    if (response.status === 403) throw failure('FORBIDDEN', 'recovery request was rejected');
  }
  if (response.status === 404 || response.status === 405) throw Object.assign(new Error('http-unavailable'), { fallback: true });
  if (!response.ok) throw failure('DISCONNECTED', `recovery request failed with ${response.status}`);
  const envelope = await response.json();
  if (!envelope || typeof envelope.ok !== 'boolean') throw failure('RECOVERY_FAILED', 'invalid recovery response');
  if (!envelope.ok) throw failure(envelope.error?.code ?? 'RECOVERY_FAILED', envelope.error?.message);
  return envelope.value;
}

async function commandCall(remote, sessionId, request, signal) {
  if (!remote?.commands?.execute) throw failure('UNAVAILABLE');
  const response = await remote.commands.execute(sessionId, `/rollback ${JSON.stringify(request)}`, [], signal);
  if (!response?.ok) throw failure('DISCONNECTED', response?.error?.message);
  const result = response.value?.result;
  if (!result || result.kind !== 'success') throw failure('UNAVAILABLE', result?.text);
  const envelope = JSON.parse(result.text);
  if (!envelope.ok) throw failure(envelope.error?.code ?? 'RECOVERY_FAILED', envelope.error?.message);
  return envelope.value;
}

/**
 * UI actions go through the plugin's same-origin HTTP route so they never append
 * command cards to the conversation. A profile without a web server falls back
 * to the command transport.
 */
export async function callRecovery(fetchImpl, remote, sessionId, request, signal) {
  if (fetchImpl) {
    try { return await httpCall(fetchImpl, sessionId, request, signal); }
    catch (error) { if (!error?.fallback) throw error; }
  }
  return commandCall(remote, sessionId, request, signal);
}

export class DraftWriter {
  constructor(token, revision, send, storage, delay = 250) {
    this.token = token;
    this.revision = revision;
    this.send = send;
    this.storage = storage;
    this.delay = delay;
    this.pending = Promise.resolve();
    this.waiters = [];
    this.timer = null;
    this.error = null;
  }
  save(edits) {
    this.latest = structuredClone(edits);
    try { this.storage.setItem(`dsh-rollback:${this.token}`, JSON.stringify({ revision: this.revision, edits: this.latest })); }
    catch { /* Host persistence remains available when browser storage is full. */ }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), this.delay);
    return new Promise((resolve, reject) => { this.waiters.push({ resolve, reject }); });
  }
  commit() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.waiters.length) return;
    const value = this.latest;
    const waiters = this.waiters.splice(0);
    const next = this.pending.catch(() => {}).then(async () => {
      const result = await this.send({ action: 'save-draft', token: this.token, revision: this.revision, edits: value });
      this.revision = result.revision;
      this.error = null;
      try {
        const current = JSON.parse(this.storage.getItem(`dsh-rollback:${this.token}`) ?? 'null');
        if (JSON.stringify(current?.edits) === JSON.stringify(value)) this.storage.removeItem(`dsh-rollback:${this.token}`);
      } catch { /* Host persistence already succeeded. */ }
      return result;
    });
    this.pending = next;
    void next.then((result) => { for (const waiter of waiters) waiter.resolve(result); }, (error) => {
      this.error = error;
      for (const waiter of waiters) waiter.reject(error);
    });
  }
  async flush() {
    this.commit();
    await this.pending;
    if (this.error) throw this.error;
  }
}
