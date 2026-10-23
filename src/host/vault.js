import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const BUCKETS = new Set(['snapshots', 'operations', 'drafts']);
const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const locks = new Map(); // In-process only; service operation-token WAL owns cross-process coordination.
const hash = (value) => createHash('sha256').update(value).digest('hex');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function error(code, message, cause) {
  const result = new Error(message, cause === undefined ? undefined : { cause });
  result.name = 'VaultError';
  result.code = code;
  return result;
}

function requireThat(condition, code, message) {
  if (!condition) throw error(code, message);
}

function version(value, label) {
  requireThat(isObject(value) && own(value, 'version'), 'ERR_VAULT_RECORD_CORRUPT', `${label}: missing version`);
  requireThat(value.version === 1, 'ERR_VAULT_UNSUPPORTED_VERSION', `${label}: unsupported version ${value.version}`);
}

function recordBytes(value) {
  let json;
  try {
    // Records contain JSON, not silently lossy JS values (undefined, NaN, BigInt, etc.).
    json = JSON.stringify({ version: 1, value }, (_key, item) => {
      if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof item)
          || (typeof item === 'number' && !Number.isFinite(item))) {
        throw new TypeError('Record must contain JSON values');
      }
      return item;
    });
  } catch (cause) {
    throw error('ERR_VAULT_RECORD_CORRUPT', 'Record is not serializable JSON', cause);
  }
  requireThat(Buffer.byteLength(json) <= MAX_RECORD_BYTES, 'ERR_VAULT_RECORD_TOO_LARGE', 'JSON record exceeds 16 MiB');
  return Buffer.from(json);
}

function copyJSON(value) {
  return JSON.parse(recordBytes(value).toString('utf8')).value;
}

async function serialized(key, action) {
  const previous = locks.get(key) ?? Promise.resolve();
  const pending = previous.then(action);
  const settled = pending.then(() => {}, () => {});
  locks.set(key, settled);
  try {
    return await pending;
  } finally {
    if (locks.get(key) === settled) locks.delete(key);
  }
}

function aborted(signal) {
  signal?.throwIfAborted();
}

async function interruptible(promise, signal) {
  if (!signal) return await promise;
  let listener;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        listener = () => reject(signal.reason);
        signal.addEventListener('abort', listener, { once: true });
        if (signal.aborted) listener();
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', listener);
  }
}

function iterable(value) {
  return value != null && !(value instanceof Uint8Array) && typeof value !== 'string'
    && (typeof value[Symbol.asyncIterator] === 'function' || typeof value[Symbol.iterator] === 'function');
}

async function* chunks(source, signal) {
  requireThat(iterable(source), 'ERR_VAULT_ATTACHMENT_DATA', 'Expected a byte stream');
  const iterator = source[Symbol.asyncIterator]?.() ?? source[Symbol.iterator]();
  let done = false;
  try {
    while (true) {
      aborted(signal);
      const item = await interruptible(iterator.next(), signal);
      if (item.done) {
        done = true;
        break;
      }
      requireThat(item.value instanceof Uint8Array, 'ERR_VAULT_ATTACHMENT_DATA', 'Stream chunks must be Uint8Array');
      aborted(signal);
      yield item.value;
    }
  } finally {
    if (!done && iterator.return) {
      // An uncooperative provider must not prevent cancellation or replace its original error.
      try {
        const closing = Promise.resolve(iterator.return());
        if (signal?.aborted) void closing.catch(() => {});
        else await closing.catch(() => {});
      } catch { /* Preserve the read/abort failure. */ }
    }
  }
}

function reference(ref) {
  requireThat(isObject(ref) && typeof ref.attachmentId === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(ref.attachmentId), 'ERR_VAULT_ATTACHMENT_REF', 'Expected a sha256 attachmentId');
  requireThat(Number.isSafeInteger(ref.bytes) && ref.bytes >= 0,
    'ERR_VAULT_ATTACHMENT_REF', 'Attachment bytes must be a nonnegative safe integer');
  return { digest: ref.attachmentId.slice(7), bytes: ref.bytes };
}

function sameReference(actual, expected) {
  requireThat(isObject(actual) && actual.attachmentId === expected.attachmentId,
    'ERR_VAULT_ATTACHMENT_ID_MISMATCH', 'Attachment ID changed; image re-encoding is not accepted');
  reference(actual);
  requireThat(actual.bytes === expected.bytes, 'ERR_VAULT_ATTACHMENT_BYTES', 'Attachment ref.bytes changed');
}

function blocks(event) {
  if (event.type !== 'user/message' || event.data?.role !== 'user') return [];
  const content = event.data.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block, index) => block?.type === 'image' || block?.type === 'file'
    ? [{ index, type: block.type, attachment: block.attachment }] : []);
}

function checkIdentity(value, sessionId, event, label) {
  version(value, label);
  requireThat(value.sessionId === sessionId && value.seq === event.seq && isDeepStrictEqual(value.event, event),
    'ERR_VAULT_KEY_CONFLICT', `${label}: session/sequence already contains a different event`);
}

function checkSnapshot(snapshot) {
  version(snapshot, 'Snapshot');
  requireThat(typeof snapshot.sessionId === 'string' && Number.isSafeInteger(snapshot.seq) && snapshot.seq >= 0
    && isObject(snapshot.event) && snapshot.event.seq === snapshot.seq
    && typeof snapshot.capturedAt === 'string' && Number.isFinite(Date.parse(snapshot.capturedAt))
    && Array.isArray(snapshot.objects), 'ERR_VAULT_SNAPSHOT_CORRUPT', 'Invalid snapshot schema');
  const expected = blocks(snapshot.event);
  requireThat(snapshot.objects.length === expected.length, 'ERR_VAULT_SNAPSHOT_CORRUPT', 'Snapshot is missing attachment objects');
  for (const [position, object] of snapshot.objects.entries()) {
    const block = expected[position];
    requireThat(isObject(object) && object.index === block.index && object.type === block.type
      && isDeepStrictEqual(object.attachment, block.attachment),
    'ERR_VAULT_SNAPSHOT_CORRUPT', 'Snapshot attachment order or raw reference changed');
    const ref = reference(object.attachment);
    requireThat(object.digest === ref.digest && object.bytes === ref.bytes,
      'ERR_VAULT_SNAPSHOT_CORRUPT', 'Snapshot digest/bytes disagree with its attachment');
  }
}

function missingHost(cause) {
  return ['ENOENT', 'NOT_FOUND', 'ATTACHMENT_NOT_FOUND'].includes(cause?.code)
    || cause?.status === 404 || cause?.statusCode === 404;
}

async function syncDirectory(path) {
  // Like DSH's attachment store, Windows relies on filesystem metadata journaling for directory entries.
  if (process.platform === 'win32') return;
  const handle = await open(path, constants.O_RDONLY);
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function safeDirectory(path) {
  const stat = await lstat(path);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'ERR_VAULT_UNSAFE_PATH', `Not a real directory: ${path}`);
}

async function safeTarget(path) {
  try {
    const stat = await lstat(path);
    requireThat(stat.isFile() && !stat.isSymbolicLink(), 'ERR_VAULT_UNSAFE_PATH', `Not a regular file: ${path}`);
    return true;
  } catch (cause) {
    if (cause?.code === 'ENOENT') return false;
    throw cause;
  }
}

function counter(expected, label) {
  const digest = createHash('sha256');
  let bytes = 0;
  return {
    add(chunk) {
      bytes += chunk.byteLength;
      requireThat(Number.isSafeInteger(bytes) && bytes <= expected.bytes,
        'ERR_VAULT_ATTACHMENT_BYTES', `${label}: byte count exceeds ref.bytes`);
      digest.update(chunk);
    },
    finish() {
      requireThat(bytes === expected.bytes, 'ERR_VAULT_ATTACHMENT_BYTES', `${label}: truncated attachment (expected ${expected.bytes}, got ${bytes})`);
      requireThat(digest.digest('hex') === expected.digest, 'ERR_VAULT_ATTACHMENT_DIGEST', `${label}: SHA-256 mismatch`);
    },
  };
}

export class Vault {
  #root;
  #ready;

  constructor(root) {
    requireThat(typeof root === 'string' && root.length > 0, 'ERR_VAULT_UNSAFE_PATH', 'Vault root must be a nonempty path');
    this.#root = resolve(root);
  }

  get root() { return this.#root; }

  async init() {
    if (!this.#ready) {
      this.#ready = this.#initialize().catch((cause) => {
        this.#ready = undefined;
        throw cause;
      });
    }
    await this.#ready;
    return this;
  }

  async #initialize() {
    const firstCreated = await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await safeDirectory(this.#root);
    if (firstCreated) {
      for (let path = this.#root; ; path = dirname(path)) {
        await syncDirectory(path);
        await syncDirectory(dirname(path));
        if (path === firstCreated) break;
      }
    }
    this.#root = await realpath(this.#root);
    for (const bucket of [...BUCKETS, 'objects']) {
      const path = join(this.#root, bucket);
      try {
        await mkdir(path, { mode: 0o700 });
      } catch (cause) {
        if (cause?.code !== 'EEXIST') throw cause;
      }
      await safeDirectory(path);
      await syncDirectory(path);
    }
    await syncDirectory(this.#root);
  }

  #recordName(bucket, key) {
    requireThat(BUCKETS.has(bucket), 'ERR_VAULT_BUCKET', 'Bucket must be snapshots, operations, or drafts');
    requireThat(typeof key === 'string', 'ERR_VAULT_KEY', 'Record key must be a string');
    // Isolate lone UTF-16 surrogates that would otherwise collide during UTF-8 encoding.
    const bytes = key.isWellFormed() ? key : Buffer.concat([Buffer.from([0xff]), Buffer.from(key, 'utf16le')]);
    return `${hash(bytes)}.json`;
  }

  async #directory(bucket) {
    await this.init();
    await safeDirectory(this.#root);
    const path = join(this.#root, bucket);
    await safeDirectory(path);
    return path;
  }

  async *#fileChunks(directory, name) {
    const path = join(directory, name);
    await safeTarget(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      requireThat((await handle.stat()).isFile(), 'ERR_VAULT_UNSAFE_PATH', `Not a regular file: ${path}`);
      while (true) {
        const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        yield buffer.subarray(0, bytesRead);
      }
    } finally {
      await handle.close();
    }
  }

  async readRecord(bucket, key) {
    const name = this.#recordName(bucket, key);
    const directory = await this.#directory(bucket);
    const buffers = [];
    let bytes = 0;
    try {
      for await (const chunk of this.#fileChunks(directory, name)) {
        bytes += chunk.length;
        requireThat(bytes <= MAX_RECORD_BYTES, 'ERR_VAULT_RECORD_TOO_LARGE', 'JSON record exceeds 16 MiB');
        buffers.push(chunk);
      }
    } catch (cause) {
      if (cause?.code === 'ENOENT') return null;
      throw cause;
    }
    let record;
    try {
      record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(buffers, bytes)));
    } catch (cause) {
      throw error('ERR_VAULT_RECORD_CORRUPT', `Corrupt JSON record: ${bucket}/${name}`, cause);
    }
    version(record, 'Record');
    requireThat(own(record, 'value'), 'ERR_VAULT_RECORD_CORRUPT', 'Record is missing its value');
    return record.value;
  }

  async writeRecord(bucket, key, value) {
    const name = this.#recordName(bucket, key);
    const data = recordBytes(value);
    const directory = await this.#directory(bucket);
    await this.#publish(directory, name, [data]);
  }

  async #publish(directory, name, source, expected, signal) {
    const destination = join(directory, name);
    const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
    let handle;
    let ownsTemporary = false;
    let failed = false;
    try {
      aborted(signal);
      await safeDirectory(directory);
      await safeTarget(destination);
      handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      ownsTemporary = true;
      const integrity = expected && counter(expected, 'Attachment backup');
      for await (const chunk of chunks(source, signal)) {
        integrity?.add(chunk);
        let offset = 0;
        while (offset < chunk.byteLength) {
          aborted(signal);
          const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset, null);
          requireThat(bytesWritten > 0, 'ERR_VAULT_WRITE', 'File write made no progress');
          offset += bytesWritten;
        }
      }
      integrity?.finish();
      aborted(signal);
      await handle.sync();
      await handle.close();
      handle = undefined;
      aborted(signal);
      await safeDirectory(directory);
      await safeTarget(destination);
      await rename(temporary, destination);
      ownsTemporary = false;
      await syncDirectory(directory);
    } catch (cause) {
      failed = true;
      throw cause;
    } finally {
      try {
        try { await handle?.close(); }
        finally { if (ownsTemporary) await unlink(temporary); }
      } catch (cause) {
        if (!failed) throw cause;
      }
    }
  }

  async #backup(object, signal, allowMissing = false) {
    const directory = await this.#directory('objects');
    const integrity = counter(object, 'Backup object');
    try {
      for await (const chunk of chunks(this.#fileChunks(directory, object.digest), signal)) integrity.add(chunk);
      integrity.finish();
      return true;
    } catch (cause) {
      if (cause?.code === 'ENOENT') {
        if (allowMissing) return false;
        throw error('ERR_VAULT_BACKUP_MISSING', `Missing backup object: ${object.digest}`, cause);
      }
      throw cause;
    }
  }

  async #hostSource(object, attachments, signal) {
    aborted(signal);
    const ref = structuredClone(object.attachment);
    if (object.type === 'image') {
      const result = await interruptible(attachments.readImage(ref, signal), signal);
      sameReference(result?.ref, object.attachment);
      requireThat(result.data instanceof Uint8Array, 'ERR_VAULT_ATTACHMENT_DATA', 'Image data must be Uint8Array');
      return { data: [result.data], ref: structuredClone(result.ref) };
    }
    const result = await interruptible(attachments.readFileStream(ref, signal), signal);
    // Accept the host's { ref, data } response as well as a direct byte iterable.
    if (iterable(result)) return { data: result, ref: structuredClone(object.attachment) };
    sameReference(result?.ref, object.attachment);
    requireThat(iterable(result.data), 'ERR_VAULT_ATTACHMENT_DATA', 'File data must be a byte stream');
    return { data: result.data, ref: structuredClone(result.ref) };
  }

  async #captureObject(block, attachments, signal) {
    const object = { ...block, attachment: structuredClone(block.attachment), ...reference(block.attachment) };
    const directory = await this.#directory('objects');
    await serialized(join(directory, object.digest), async () => {
      aborted(signal);
      if (await this.#backup(object, signal, true)) return;
      const source = await this.#hostSource(object, attachments, signal);
      await this.#publish(directory, object.digest, source.data, object, signal);
    });
    return object;
  }

  async capture(sessionId, event, attachments, signal) {
    requireThat(typeof sessionId === 'string', 'ERR_VAULT_SESSION', 'sessionId must be a string');
    const raw = copyJSON(event); // Capture caller-owned data before the first await.
    requireThat(isObject(raw) && Number.isSafeInteger(raw.seq) && raw.seq >= 0,
      'ERR_VAULT_EVENT', 'Event must have a nonnegative safe-integer seq');
    const key = `${sessionId}:${raw.seq}`;
    const directory = await this.#directory('snapshots');
    return await serialized(join(directory, this.#recordName('snapshots', key)), async () => {
      // Even an already-aborted attachment operation first makes the text durable.
      let draft = await this.readRecord('drafts', key);
      if (draft !== null) checkIdentity(draft, sessionId, raw, 'Draft');
      else {
        draft = { version: 1, sessionId, seq: raw.seq, event: raw, capturedAt: new Date().toISOString() };
        await this.writeRecord('drafts', key, draft);
      }
      aborted(signal);
      const existing = await this.readRecord('snapshots', key);
      if (existing !== null) {
        checkSnapshot(existing);
        checkIdentity(existing, sessionId, raw, 'Snapshot');
        for (const object of existing.objects) await this.#backup(object, signal);
        return existing;
      }
      const objects = [];
      for (const block of blocks(raw)) objects.push(await this.#captureObject(block, attachments, signal));
      const snapshot = { version: 1, sessionId, seq: raw.seq, event: raw, objects, capturedAt: draft.capturedAt };
      checkSnapshot(snapshot);
      aborted(signal);
      await this.#publish(directory, this.#recordName('snapshots', key), [recordBytes(snapshot)], undefined, signal);
      // Drafts and all successfully saved objects are intentionally retained on success AND failure.
      return snapshot;
    });
  }

  async #verifyHost(object, attachments, signal) {
    const source = await this.#hostSource(object, attachments, signal);
    const integrity = counter(object, 'Host attachment');
    for await (const chunk of chunks(source.data, signal)) integrity.add(chunk);
    integrity.finish();
    return source.ref;
  }

  async *#restoreSource(object, state, signal) {
    try {
      const directory = await this.#directory('objects');
      const integrity = counter(object, 'Backup during restore');
      for await (const chunk of chunks(this.#fileChunks(directory, object.digest), signal)) {
        integrity.add(chunk);
        yield chunk;
      }
      integrity.finish();
      state.complete = true;
    } catch (cause) {
      state.error = cause;
      throw cause;
    }
  }

  async #restore(object, attachments, signal) {
    aborted(signal);
    const ref = object.attachment;
    const state = { complete: false };
    const source = this.#restoreSource(object, state, signal);
    let saved;
    try {
      if (object.type === 'file') {
        saved = await interruptible(attachments.saveFileStream({ data: source, name: ref.name, signal }), signal);
      } else {
        // Only images must be materialized: the host image API requires Uint8Array.
        const buffers = [];
        for await (const chunk of source) buffers.push(chunk);
        aborted(signal);
        saved = await interruptible(attachments.saveImage({
          data: Buffer.concat(buffers, object.bytes), mediaType: ref.mediaType, name: ref.name,
        }), signal);
      }
      if (state.error) throw state.error;
      requireThat(state.complete, 'ERR_VAULT_INCOMPLETE_RESTORE', 'Host did not consume the entire backup stream');
      sameReference(saved, ref);
      aborted(signal);
    } finally {
      await source.return();
    }
    // A returned ref alone does not establish that the host actually stored readable, intact bytes.
    return await this.#verifyHost({ ...object, attachment: structuredClone(saved) }, attachments, signal);
  }

  async verify(snapshot, attachments, signal) {
    const copy = copyJSON(snapshot);
    checkSnapshot(copy);
    aborted(signal);
    // Check ALL backups first, even when the host still has the corresponding objects.
    for (const object of copy.objects) await this.#backup(object, signal);
    const refs = [];
    for (const object of copy.objects) {
      aborted(signal);
      try {
        refs.push(await this.#verifyHost(object, attachments, signal));
      } catch (cause) {
        aborted(signal);
        if (!missingHost(cause)) throw cause;
        refs.push(await this.#restore(object, attachments, signal));
      }
    }
    return refs;
  }
}
