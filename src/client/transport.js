export async function callRecovery(remote, sessionId, request, signal) {
  if (!remote?.commands?.execute) throw Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' });
  const response = await remote.commands.execute(sessionId, `/rollback ${JSON.stringify(request)}`, [], signal);
  if (!response?.ok) throw Object.assign(new Error(response?.error?.message ?? 'DISCONNECTED'), { code: 'DISCONNECTED' });
  const result = response.value?.result;
  if (!result || result.kind !== 'success') throw Object.assign(new Error(result?.text ?? 'UNAVAILABLE'), { code: 'UNAVAILABLE' });
  const envelope = JSON.parse(result.text);
  if (!envelope.ok) throw Object.assign(new Error(envelope.error.message), { code: envelope.error.code });
  return envelope.value;
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
