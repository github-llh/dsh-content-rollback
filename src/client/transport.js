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
