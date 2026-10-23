import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { Vault } from '../src/host/vault.js';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const recordPath = (root, bucket, key) => join(root, bucket, `${sha256(key)}.json`);
const objectPath = (root, ref) => join(root, 'objects', ref.attachmentId.slice(7));
const refFor = (data, fields = {}) => ({ attachmentId: `sha256:${sha256(data)}`, bytes: data.byteLength, ...fields });
const eventFor = (content, seq = 1) => ({ type: 'user/message', seq, time: 1, data: { id: `message-${seq}`, role: 'user', source: { kind: 'user' }, content } });
const missing = () => Object.assign(new Error('Host object is missing'), { code: 'ENOENT' });
const code = (expected) => (cause) => { assert.equal(cause.code, expected); return true; };

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'dsh-vault-test-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const vault = new Vault(root);
  await vault.init();
  return { root, vault };
}

async function noTemporary(root) {
  for (const bucket of ['snapshots', 'drafts', 'operations', 'objects']) {
    const names = await fs.readdir(join(root, bucket));
    assert.deepEqual(names.filter((name) => name.endsWith('.tmp')), [], bucket);
  }
}

function hostFor(entries = []) {
  const store = new Map(entries.map(([ref, data]) => [ref.attachmentId, { ref: structuredClone(ref), data: Buffer.from(data) }]));
  const calls = { readImage: [], readFileStream: [], saveImage: [], saveFileStream: [] };
  const host = {
    store,
    calls,
    async readImage(ref, signal) {
      calls.readImage.push({ ref: structuredClone(ref), signal });
      const item = store.get(ref.attachmentId);
      if (!item) throw missing();
      return { ref: structuredClone(item.ref), data: new Uint8Array(item.data) };
    },
    async readFileStream(ref, signal) {
      calls.readFileStream.push({ ref: structuredClone(ref), signal });
      const item = store.get(ref.attachmentId);
      if (!item) throw missing();
      return {
        ref: structuredClone(item.ref),
        data: (async function* () {
          for (let offset = 0; offset < item.data.length; offset += 7) yield item.data.subarray(offset, offset + 7);
        })(),
      };
    },
    async saveFileStream({ data, name, signal }) {
      calls.saveFileStream.push({ name, signal });
      assert.equal(typeof data[Symbol.asyncIterator], 'function');
      assert.equal(data instanceof Uint8Array, false);
      const buffers = [];
      for await (const chunk of data) buffers.push(chunk);
      const bytes = Buffer.concat(buffers);
      const ref = refFor(bytes, { name });
      store.set(ref.attachmentId, { ref, data: bytes });
      return structuredClone(ref);
    },
    async saveImage({ data, mediaType, name }) {
      calls.saveImage.push({ mediaType, name });
      assert.ok(data instanceof Uint8Array);
      const ref = refFor(data, { mediaType, name });
      store.set(ref.attachmentId, { ref, data: Buffer.from(data) });
      return structuredClone(ref);
    },
  };
  return host;
}

test('captures multimodal blocks in original order, preserves full raw event and real refs', async (t) => {
  const { root, vault } = await fixture(t);
  const imageBytes = Buffer.from('the already-sent, host-normalized image');
  const fileBytes = Buffer.from('file contents');
  const image = refFor(imageBytes, { name: '原图.png', mediaType: 'image/png', hostMetadata: { normalized: true } });
  const file = refFor(fileBytes, { name: '../../report.txt', mediaType: 'text/plain' });
  const event = eventFor([
    { type: 'text', text: 'before', extra: ['keep', 3] },
    { type: 'image', attachment: image, caption: 'caption' },
    { type: 'text', text: 'between' },
    { type: 'file', attachment: file },
    { type: 'image', attachment: image },
    { type: 'text', text: 'after' },
  ], 42);
  event.unknown = { nested: ['unchanged'] };
  const original = structuredClone(event);
  const host = hostFor([[image, imageBytes], [file, fileBytes]]);
  const readImage = host.readImage;
  const signal = new AbortController().signal;
  host.readImage = async (ref, receivedSignal) => {
    assert.deepEqual((await vault.readRecord('drafts', 'session:42')).event, original);
    const result = await readImage(ref, receivedSignal);
    ref.hostMetadata.normalized = false; // Provider cannot mutate the raw event through its argument.
    return result;
  };
  const pending = vault.capture('session', event, host, signal);
  event.data.content[0].text = 'caller mutated while awaiting';
  image.hostMetadata.normalized = false;
  const snapshot = await pending;
  assert.deepEqual(snapshot.event, original);
  assert.deepEqual(snapshot.objects.map(({ index, type }) => [index, type]), [[1, 'image'], [3, 'file'], [4, 'image']]);
  assert.deepEqual(snapshot.objects[0].attachment, original.data.content[1].attachment);
  assert.equal(snapshot.objects[0].digest, sha256(imageBytes));
  assert.equal(snapshot.objects[1].bytes, fileBytes.length);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.sessionId, 'session');
  assert.equal(snapshot.seq, 42);
  assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
  assert.equal(host.calls.readImage.length, 1);
  assert.equal(host.calls.readFileStream.length, 1);
  assert.equal(host.calls.readImage[0].signal, signal);
  assert.deepEqual(host.calls.readFileStream[0].ref, file);
  assert.deepEqual(await fs.readFile(objectPath(root, image)), imageBytes);
  assert.deepEqual(await vault.readRecord('snapshots', 'session:42'), snapshot);
  assert.deepEqual((await vault.readRecord('drafts', 'session:42')).event, original);
  assert.equal((await fs.readdir(join(root, 'objects'))).length, 2);
  const pristine = structuredClone(snapshot);
  assert.deepEqual((await vault.verify(snapshot, host, signal)).map((ref) => ref.attachmentId),
    [image.attachmentId, file.attachmentId, image.attachmentId]);
  assert.deepEqual(snapshot, pristine);
  snapshot.objects[0].attachment.hostMetadata.normalized = false;
  assert.deepEqual(snapshot.event, original, 'object metadata must not alias the raw event');
  snapshot.event.unknown.nested.push('local mutation');
  assert.deepEqual((await vault.readRecord('snapshots', 'session:42')).event, original);
  await noTemporary(root);
});

test('text-only and non-user events preserve content without inventing attachment references', async (t) => {
  const { vault } = await fixture(t);
  for (const event of [
    eventFor('plain string content', 1),
    { type: 'assistant', seq: 2, message: { role: 'assistant', content: [{ type: 'image', attachment: 'not a user ref' }] } },
    { seq: 3, message: { role: 'user', content: [{ type: 'text', text: 'role-only user' }] } },
  ]) {
    const snapshot = await vault.capture('', event, {});
    assert.deepEqual(snapshot.event, event);
    assert.deepEqual(snapshot.objects, []);
    assert.deepEqual(await vault.verify(snapshot, {}), []);
  }
});

test('zero-byte images/files are hashed, deduplicated, and restored', async (t) => {
  const { root, vault } = await fixture(t);
  const bytes = Buffer.alloc(0);
  const image = refFor(bytes, { name: 'empty.png', mediaType: 'image/png' });
  const file = refFor(bytes, { name: 'empty.dat' });
  const host = hostFor([[image, bytes]]);
  const snapshot = await vault.capture('empty', eventFor([
    { type: 'image', attachment: image }, { type: 'file', attachment: file },
  ]), host);
  assert.equal((await fs.stat(objectPath(root, file))).size, 0);
  assert.equal((await fs.readdir(join(root, 'objects'))).length, 1);
  host.store.clear();
  const refs = await vault.verify(snapshot, host);
  assert.deepEqual(refs.map((ref) => ref.attachmentId), [image.attachmentId, file.attachmentId]);
  assert.equal(host.calls.saveImage.length, 1);
  assert.equal(host.calls.saveFileStream.length, 0);
  host.store.clear();
  const fileOnly = await vault.capture('empty-file', eventFor([{ type: 'file', attachment: file }]), {});
  await vault.verify(fileOnly, host);
  assert.equal(host.calls.saveFileStream.length, 1);
  await noTemporary(root);
});

test('large files stream with backpressure in capture, host verification, and restore', async (t) => {
  const { root, vault } = await fixture(t);
  const chunk = Buffer.alloc(64 * 1024, 0x6d);
  const count = 640; // 40 MiB, greater than the JSON record limit; never materialized as one buffer.
  const digest = createHash('sha256');
  for (let i = 0; i < count; i++) digest.update(chunk);
  const ref = { attachmentId: `sha256:${digest.digest('hex')}`, bytes: count * chunk.length, name: 'large.bin' };
  let present = true;
  let generated = 0;
  let saved = 0;
  let largest = 0;
  const host = {
    async readFileStream(received, signal) {
      assert.deepEqual(received, ref);
      assert.equal(signal, controller.signal);
      if (!present) throw missing();
      return (async function* () {
        for (let i = 0; i < count; i++) {
          generated++;
          if (generated === 3) {
            const names = await fs.readdir(join(root, 'objects'));
            const temporary = names.find((name) => name.endsWith('.tmp'));
            assert.ok(temporary, 'stream is written before EOF');
            assert.ok((await fs.stat(join(root, 'objects', temporary))).size >= 2 * chunk.length);
            assert.equal(await vault.readRecord('snapshots', 'large:1'), null, 'snapshot is not visible before EOF');
          }
          yield chunk;
        }
      })();
    },
    async saveFileStream({ data, name, signal }) {
      assert.equal(name, ref.name);
      assert.equal(signal, controller.signal);
      const restored = createHash('sha256');
      for await (const part of data) {
        largest = Math.max(largest, part.byteLength);
        saved += part.byteLength;
        restored.update(part);
      }
      assert.equal(restored.digest('hex'), ref.attachmentId.slice(7));
      present = true;
      return ref;
    },
  };
  const controller = new AbortController();
  const snapshot = await vault.capture('large', eventFor([{ type: 'file', attachment: ref }]), host, controller.signal);
  assert.equal(generated, count);
  assert.equal((await fs.stat(objectPath(root, ref))).size, ref.bytes);
  present = false;
  assert.deepEqual(await vault.verify(snapshot, host, controller.signal), [ref]);
  assert.equal(saved, ref.bytes);
  assert.ok(largest <= 64 * 1024);
  assert.equal(generated, count * 2, 'restored host bytes were independently verified');
  await noTemporary(root);
});

test('truncation, excess bytes, and wrong digests never publish a snapshot or invalid object', async (t) => {
  for (const type of ['image', 'file']) {
    for (const mode of ['truncated', 'excess', 'digest']) {
      await t.test(`${type}: ${mode}`, async (t) => {
        const { root, vault } = await fixture(t);
        const expected = Buffer.from('expected');
        const actual = mode === 'truncated' ? Buffer.from('ex') : mode === 'excess' ? Buffer.from('expected-extra') : Buffer.from('WRONG!!!');
        const ref = refFor(expected);
        const host = hostFor([[ref, actual]]);
        const event = eventFor([{ type: 'text', text: 'must survive' }, { type, attachment: ref }]);
        await assert.rejects(() => vault.capture('bad', event, host),
          code(mode === 'digest' ? 'ERR_VAULT_ATTACHMENT_DIGEST' : 'ERR_VAULT_ATTACHMENT_BYTES'));
        assert.deepEqual((await vault.readRecord('drafts', 'bad:1')).event, event);
        assert.equal(await vault.readRecord('snapshots', 'bad:1'), null);
        assert.deepEqual(await fs.readdir(join(root, 'objects')), []);
        await noTemporary(root);
      });
    }
  }
});

test('invalid attachment refs and returned host refs fail only after saving the text', async (t) => {
  const bytes = Buffer.from('ref validation');
  const ref = refFor(bytes);
  for (const [label, attachment, host, expected] of [
    ['missing', undefined, {}, 'ERR_VAULT_ATTACHMENT_REF'],
    ['missing bytes', { attachmentId: ref.attachmentId }, {}, 'ERR_VAULT_ATTACHMENT_REF'],
    ['negative bytes', { ...ref, bytes: -1 }, {}, 'ERR_VAULT_ATTACHMENT_REF'],
    ['unsafe bytes', { ...ref, bytes: Number.MAX_SAFE_INTEGER + 1 }, {}, 'ERR_VAULT_ATTACHMENT_REF'],
    ['bad id', { ...ref, attachmentId: '../../escape' }, {}, 'ERR_VAULT_ATTACHMENT_REF'],
    ['changed id', ref, { readImage: async () => ({ ref: refFor(Buffer.from('other')), data: bytes }) }, 'ERR_VAULT_ATTACHMENT_ID_MISMATCH'],
    ['changed bytes', ref, { readImage: async () => ({ ref: { ...ref, bytes: 1 }, data: bytes }) }, 'ERR_VAULT_ATTACHMENT_BYTES'],
    ['not bytes', ref, { readImage: async () => ({ ref, data: 'text' }) }, 'ERR_VAULT_ATTACHMENT_DATA'],
  ]) {
    await t.test(label, async (t) => {
      const { root, vault } = await fixture(t);
      const block = { type: 'image' };
      if (attachment !== undefined) block.attachment = attachment;
      const event = eventFor([{ type: 'text', text: 'retained' }, block]);
      await assert.rejects(() => vault.capture('refs', event, host), code(expected));
      assert.deepEqual((await vault.readRecord('drafts', 'refs:1')).event, event);
      assert.equal(await vault.readRecord('snapshots', 'refs:1'), null);
      await noTemporary(root);
    });
  }
});

test('provider errors propagate by identity; earlier objects and drafts survive retries', async (t) => {
  const { root, vault } = await fixture(t);
  const imageBytes = Buffer.from('saved image');
  const fileBytes = Buffer.from('later file');
  const image = refFor(imageBytes);
  const file = refFor(fileBytes);
  const failure = new Error('upstream disconnected');
  let closed = false;
  const host = hostFor([[image, imageBytes], [file, fileBytes]]);
  const readFile = host.readFileStream;
  host.readFileStream = async () => (async function* () {
    try { yield fileBytes.subarray(0, 2); throw failure; }
    finally { closed = true; }
  })();
  const event = eventFor([{ type: 'image', attachment: image }, { type: 'file', attachment: file }]);
  await assert.rejects(() => vault.capture('retry', event, host), (cause) => cause === failure);
  assert.ok(closed);
  assert.equal(await vault.readRecord('snapshots', 'retry:1'), null);
  assert.deepEqual(await fs.readFile(objectPath(root, image)), imageBytes);
  assert.deepEqual((await vault.readRecord('drafts', 'retry:1')).event, event);
  await noTemporary(root);
  host.readFileStream = readFile;
  host.store.delete(image.attachmentId);
  const snapshot = await vault.capture('retry', event, host);
  assert.equal(snapshot.objects.length, 2);
  assert.equal(host.calls.readImage.length, 1, 'valid prior backup is retained and reused');
  assert.ok(await vault.readRecord('drafts', 'retry:1'));
});

test('abort before reading and mid-stream preserves text, abort reason, and cleans only owned temp files', async (t) => {
  for (const before of [true, false]) {
    await t.test(before ? 'already aborted' : 'mid-stream', async (t) => {
      const { root, vault } = await fixture(t);
      const foreign = join(root, 'objects', '.another-process.tmp');
      await fs.writeFile(foreign, 'do not delete');
      const controller = new AbortController();
      const failure = new Error('cancelled by caller');
      const bytes = Buffer.from('cancelled attachment');
      const ref = refFor(bytes);
      let closed = false;
      const host = {
        async readFileStream(received, signal) {
          assert.equal(signal, controller.signal);
          assert.deepEqual(received, ref);
          return (async function* () {
            try { yield bytes.subarray(0, 2); controller.abort(failure); yield bytes.subarray(2); }
            finally { closed = true; }
          })();
        },
      };
      if (before) controller.abort(failure);
      const event = eventFor([{ type: 'text', text: 'abort cannot erase this' }, { type: 'file', attachment: ref }]);
      await assert.rejects(() => vault.capture('abort', event, host, controller.signal), (cause) => cause === failure);
      assert.equal(closed, !before);
      assert.deepEqual((await vault.readRecord('drafts', 'abort:1')).event, event);
      assert.equal(await vault.readRecord('snapshots', 'abort:1'), null);
      assert.deepEqual(await fs.readdir(join(root, 'objects')), [basename(foreign)]);
      assert.equal(await fs.readFile(foreign, 'utf8'), 'do not delete');
    });
  }
});

test('abort interrupts a stalled provider without waiting for iterator.return', async (t) => {
  const { root, vault } = await fixture(t);
  const controller = new AbortController();
  const reason = new Error('stop stalled read');
  const ref = refFor(Buffer.from('unavailable'));
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let returned = false;
  const host = {
    readFileStream: () => ({
      [Symbol.asyncIterator]() { return this; },
      next() { started(); return new Promise(() => {}); },
      return() { returned = true; return new Promise(() => {}); },
    }),
  };
  const pending = vault.capture('stalled', eventFor([{ type: 'file', attachment: ref }]), host, controller.signal);
  // Observe the rejection before aborting: a promise that rejects while nothing
  // handles it is reported by the runner as async activity after the test ended.
  const rejection = assert.rejects(pending, (cause) => cause === reason);
  await ready;
  controller.abort(reason);
  await rejection;
  assert.ok(returned);
  assert.equal(await vault.readRecord('snapshots', 'stalled:1'), null);
  await noTemporary(root);
});

test('repeated/concurrent captures across instances publish one consistent snapshot and deduplicate objects', async (t) => {
  const { root, vault } = await fixture(t);
  const other = new Vault(root);
  const bytes = Buffer.from('shared object');
  const ref = refFor(bytes);
  const host = hostFor([[ref, bytes]]);
  const event = eventFor([{ type: 'file', attachment: ref }, { type: 'file', attachment: ref }]);
  const snapshots = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    (i % 2 ? other : vault).capture('concurrent', event, host)));
  for (const snapshot of snapshots) assert.deepEqual(snapshot, snapshots[0]);
  assert.equal(host.calls.readFileStream.length, 1);
  assert.notEqual(snapshots[0], snapshots[1]);
  const additional = await Promise.all([vault.capture('second', event, host), other.capture('third', event, host)]);
  assert.equal(additional.length, 2);
  assert.equal(host.calls.readFileStream.length, 1);
  host.store.clear();
  assert.deepEqual(await other.capture('concurrent', event, {}), snapshots[0]);
  assert.equal((await fs.readdir(join(root, 'objects'))).length, 1);
  const changed = structuredClone(event);
  changed.data.content.push({ type: 'text', text: 'different event with same seq' });
  await assert.rejects(() => vault.capture('concurrent', changed, host), code('ERR_VAULT_KEY_CONFLICT'));
  assert.deepEqual(await vault.readRecord('snapshots', 'concurrent:1'), snapshots[0]);
  await noTemporary(root);
});

test('failed concurrent capture releases the in-process queue for a successful retry', async (t) => {
  const { root, vault } = await fixture(t);
  const bytes = Buffer.from('retry concurrently');
  const ref = refFor(bytes);
  const event = eventFor([{ type: 'file', attachment: ref }]);
  const failure = new Error('first caller fails');
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const first = vault.capture('queue', event, { async readFileStream() { entered.resolve(); await release.promise; throw failure; } });
  await entered.promise;
  const pending = Promise.allSettled([first, vault.capture('queue', event, hostFor([[ref, bytes]]))]);
  release.resolve();
  const results = await pending;
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason, failure);
  assert.equal(results[1].status, 'fulfilled');
  assert.deepEqual(await vault.readRecord('snapshots', 'queue:1'), results[1].value);
  await noTemporary(root);
});

test('verify restores missing image/file backups and rechecks readable host content', async (t) => {
  const { root, vault } = await fixture(t);
  const imageData = Buffer.from('normalized image bytes');
  const fileData = Buffer.from('restore file');
  const image = refFor(imageData, { name: 'photo.webp', mediaType: 'image/webp' });
  const file = refFor(fileData, { name: 'report.txt' });
  const host = hostFor([[image, imageData], [file, fileData]]);
  const event = eventFor([{ type: 'file', attachment: file }, { type: 'image', attachment: image }]);
  const snapshot = await vault.capture('restore', event, host);
  const original = structuredClone(snapshot);
  host.store.clear();
  const signal = new AbortController().signal;
  const refs = await vault.verify(snapshot, host, signal);
  assert.deepEqual(refs, [file, image]);
  assert.deepEqual(snapshot, original);
  assert.deepEqual(host.calls.saveFileStream, [{ name: file.name, signal }]);
  assert.deepEqual(host.calls.saveImage, [{ name: image.name, mediaType: image.mediaType }]);
  assert.deepEqual(host.store.get(file.attachmentId).data, fileData);
  assert.deepEqual(host.store.get(image.attachmentId).data, imageData);
  await vault.verify(snapshot, host);
  assert.equal(host.calls.saveImage.length, 1);
  assert.equal(host.calls.saveFileStream.length, 1);
  assert.deepEqual(await vault.readRecord('snapshots', 'restore:1'), original);
  assert.ok(await vault.readRecord('drafts', 'restore:1'));
  await noTemporary(root);
});

test('verify rejects a re-encoded image with a different returned ID', async (t) => {
  const { root, vault } = await fixture(t);
  const data = Buffer.from('sent image');
  const ref = refFor(data, { name: 'original.png', mediaType: 'image/png' });
  const host = hostFor([[ref, data]]);
  const snapshot = await vault.capture('reencoded', eventFor([{ type: 'image', attachment: ref }]), host);
  host.store.clear();
  host.saveImage = async () => refFor(Buffer.from('reencoded image'));
  await assert.rejects(() => vault.verify(snapshot, host), code('ERR_VAULT_ATTACHMENT_ID_MISMATCH'));
  assert.deepEqual(await fs.readFile(objectPath(root, ref)), data);
  assert.deepEqual(await vault.readRecord('snapshots', 'reencoded:1'), snapshot);
  await noTemporary(root);
});

test('verify detects savers that truncate, change IDs, or claim to save unreadable/corrupt bytes', async (t) => {
  for (const mode of ['partial-consumption', 'different-id', 'still-missing', 'wrong-bytes']) {
    await t.test(mode, async (t) => {
      const { root, vault } = await fixture(t);
      const data = Buffer.alloc(128 * 1024, 5);
      const ref = refFor(data, { name: 'restore.bin' });
      const host = hostFor([[ref, data]]);
      const snapshot = await vault.capture('lying-host', eventFor([{ type: 'file', attachment: ref }]), host);
      host.store.clear();
      host.saveFileStream = async ({ data: source }) => {
        if (mode === 'partial-consumption') { await source.next(); return ref; }
        for await (const _chunk of source) { /* Consume without retaining the backup in memory. */ }
        if (mode === 'different-id') return refFor(Buffer.from('changed'));
        if (mode === 'wrong-bytes') host.store.set(ref.attachmentId, { ref, data: Buffer.alloc(ref.bytes, 6) });
        return ref;
      };
      const expected = {
        'partial-consumption': 'ERR_VAULT_INCOMPLETE_RESTORE', 'different-id': 'ERR_VAULT_ATTACHMENT_ID_MISMATCH',
        'still-missing': 'ENOENT', 'wrong-bytes': 'ERR_VAULT_ATTACHMENT_DIGEST',
      }[mode];
      await assert.rejects(() => vault.verify(snapshot, host), code(expected));
      assert.deepEqual(await fs.readFile(objectPath(root, ref)), data);
      await noTemporary(root);
    });
  }
});

test('verify does not treat host corruption or permission failures as missing', async (t) => {
  for (const mode of ['digest', 'truncated', 'permission']) {
    await t.test(mode, async (t) => {
      const { vault } = await fixture(t);
      const data = Buffer.from('good');
      const ref = refFor(data);
      const host = hostFor([[ref, data]]);
      const snapshot = await vault.capture('host-corrupt', eventFor([{ type: 'file', attachment: ref }]), host);
      const permission = Object.assign(new Error('access denied'), { code: 'EACCES' });
      if (mode === 'permission') host.readFileStream = async () => { throw permission; };
      else host.store.set(ref.attachmentId, { ref, data: Buffer.from(mode === 'digest' ? 'evil' : 'g') });
      await assert.rejects(() => vault.verify(snapshot, host), mode === 'permission' ? (cause) => cause === permission
        : code(mode === 'digest' ? 'ERR_VAULT_ATTACHMENT_DIGEST' : 'ERR_VAULT_ATTACHMENT_BYTES'));
      assert.equal(host.calls.saveFileStream.length, 0);
    });
  }
});

test('existing snapshots and verify never trust corrupt/missing backup objects even with healthy host data', async (t) => {
  for (const mode of ['digest', 'truncated', 'missing']) {
    await t.test(mode, async (t) => {
      const { root, vault } = await fixture(t);
      const firstData = Buffer.from('first object');
      const secondData = Buffer.from('second object');
      const first = refFor(firstData);
      const second = refFor(secondData);
      const host = hostFor([[first, firstData], [second, secondData]]);
      const event = eventFor([{ type: 'file', attachment: first }, { type: 'image', attachment: second }]);
      const snapshot = await vault.capture('damaged', event, host);
      if (mode === 'missing') await fs.unlink(objectPath(root, second));
      else await fs.writeFile(objectPath(root, second), mode === 'truncated' ? 's' : Buffer.alloc(second.bytes, 0));
      const expected = { digest: 'ERR_VAULT_ATTACHMENT_DIGEST', truncated: 'ERR_VAULT_ATTACHMENT_BYTES', missing: 'ERR_VAULT_BACKUP_MISSING' }[mode];
      const readsBefore = host.calls.readFileStream.length + host.calls.readImage.length;
      await assert.rejects(() => vault.capture('damaged', event, host), code(expected));
      await assert.rejects(() => vault.verify(snapshot, host), code(expected));
      assert.equal(host.calls.readFileStream.length + host.calls.readImage.length, readsBefore, 'all backups verified before any host call');
      assert.equal(host.calls.saveFileStream.length + host.calls.saveImage.length, 0);
      assert.deepEqual(await vault.readRecord('snapshots', 'damaged:1'), snapshot);
      assert.deepEqual(await fs.readFile(objectPath(root, first)), firstData);
      await noTemporary(root);
    });
  }
});

test('malformed snapshots cannot omit, reorder, redirect, or rewrite raw attachment refs', async (t) => {
  const { vault } = await fixture(t);
  const data = Buffer.from('snapshot schema');
  const ref = refFor(data);
  const snapshot = await vault.capture('schema', eventFor([{ type: 'text', text: 'original' }, { type: 'file', attachment: ref }]), hostFor([[ref, data]]));
  for (const mutate of [
    (copy) => { copy.objects = []; },
    (copy) => { copy.objects[0].index = 0; },
    (copy) => { copy.objects[0].type = 'image'; },
    (copy) => { copy.objects[0].digest = '../../outside'; },
    (copy) => { copy.objects[0].attachment.bytes++; },
    (copy) => { copy.seq++; },
  ]) {
    const copy = structuredClone(snapshot);
    mutate(copy);
    await assert.rejects(() => vault.verify(copy, {}), code('ERR_VAULT_SNAPSHOT_CORRUPT'));
  }
  await assert.rejects(() => vault.verify({ ...snapshot, version: 2 }, {}), code('ERR_VAULT_UNSUPPORTED_VERSION'));
});

test('records round-trip arbitrary JSON, atomically overwrite, and concurrent readers see complete values', async (t) => {
  const { root, vault } = await fixture(t);
  assert.equal(await vault.readRecord('operations', 'absent'), null);
  const old = { state: 'old', data: 'a'.repeat(128 * 1024) };
  const fresh = { state: 'new', data: 'b'.repeat(128 * 1024) };
  await vault.writeRecord('operations', 'atomic', old);
  const work = Array.from({ length: 20 }, (_, i) => i % 2
    ? vault.writeRecord('operations', 'atomic', i % 4 === 1 ? fresh : old)
    : vault.readRecord('operations', 'atomic').then((value) => assert.ok(isEqual(value, old) || isEqual(value, fresh))));
  await Promise.all(work);
  await vault.writeRecord('operations', 'atomic', fresh);
  assert.deepEqual(await vault.readRecord('operations', 'atomic'), fresh);
  for (const [i, value] of [null, true, 42, 'string', [1, '二'], { version: 1, nested: {} }].entries()) {
    await vault.writeRecord('drafts', `${i}`, value);
    assert.deepEqual(await vault.readRecord('drafts', `${i}`), value);
  }
  await noTemporary(root);
});

function isEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

test('record corruption, unsupported versions, invalid UTF-8, and oversize JSON report explicit errors', async (t) => {
  const { root, vault } = await fixture(t);
  const path = recordPath(root, 'operations', 'corrupt');
  for (const data of ['', '{', 'null', '[]', '{}', '{"version":1}', Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])]) {
    await fs.writeFile(path, data);
    await assert.rejects(() => vault.readRecord('operations', 'corrupt'), code('ERR_VAULT_RECORD_CORRUPT'));
  }
  for (const version of [0, 2, '1', null]) {
    await fs.writeFile(path, JSON.stringify({ version, value: {} }));
    await assert.rejects(() => vault.readRecord('operations', 'corrupt'), code('ERR_VAULT_UNSUPPORTED_VERSION'));
  }
  await vault.writeRecord('operations', 'corrupt', { safe: true });
  for (const value of [undefined, NaN, { value: BigInt(1) }, { value: undefined }]) {
    await assert.rejects(() => vault.writeRecord('operations', 'corrupt', value), code('ERR_VAULT_RECORD_CORRUPT'));
    assert.deepEqual(await vault.readRecord('operations', 'corrupt'), { safe: true });
  }
  const circular = {}; circular.self = circular;
  await assert.rejects(() => vault.writeRecord('operations', 'corrupt', circular), code('ERR_VAULT_RECORD_CORRUPT'));
  await assert.rejects(() => vault.writeRecord('operations', 'corrupt', '大'.repeat(6 * 1024 * 1024)), code('ERR_VAULT_RECORD_TOO_LARGE'));
  assert.deepEqual(await vault.readRecord('operations', 'corrupt'), { safe: true });
  await fs.writeFile(path, Buffer.alloc(16 * 1024 * 1024 + 1, 0x20));
  await assert.rejects(() => vault.readRecord('operations', 'corrupt'), code('ERR_VAULT_RECORD_TOO_LARGE'));
  const prefixBytes = Buffer.byteLength('{"version":1,"value":""}');
  const boundary = 'a'.repeat(16 * 1024 * 1024 - prefixBytes);
  await vault.writeRecord('operations', 'boundary', boundary);
  assert.equal(await vault.readRecord('operations', 'boundary'), boundary);
  await assert.rejects(() => vault.writeRecord('operations', 'boundary', `${boundary}a`), code('ERR_VAULT_RECORD_TOO_LARGE'));
  await noTemporary(root);
});

test('all keys become hash-only filenames and bucket traversal is rejected', async (t) => {
  const { root, vault } = await fixture(t);
  const keys = ['', '..', '../../outside', '/tmp/absolute', 'C:\\windows\\..\\outside', 'x\0y', '会话:42', 'a'.repeat(10_000)];
  for (const bucket of ['snapshots', 'operations', 'drafts']) {
    for (const key of keys) {
      await vault.writeRecord(bucket, key, { key });
      assert.deepEqual(await vault.readRecord(bucket, key), { key });
    }
    const names = await fs.readdir(join(root, bucket));
    assert.deepEqual(names.sort(), keys.map((key) => `${sha256(key)}.json`).sort());
    assert.ok(names.every((name) => /^[a-f0-9]{64}\.json$/.test(name)));
  }
  for (const bucket of ['../escape', 'objects', '', '__proto__', '/tmp', null]) {
    await assert.rejects(() => vault.writeRecord(bucket, 'key', {}), code('ERR_VAULT_BUCKET'));
    await assert.rejects(() => vault.readRecord(bucket, 'key'), code('ERR_VAULT_BUCKET'));
  }
  await assert.rejects(() => vault.writeRecord('drafts', 1, {}), code('ERR_VAULT_KEY'));
  await noTemporary(root);
});

test('symlinked roots, managed directories, record files, and object files are rejected', async (t) => {
  const { root, vault } = await fixture(t);
  const outside = join(root, 'outside');
  await fs.mkdir(outside);
  const linkedRoot = join(root, 'linked-root');
  await fs.symlink(outside, linkedRoot, 'dir');
  await assert.rejects(() => new Vault(linkedRoot).init(), code('ERR_VAULT_UNSAFE_PATH'));
  const record = join(outside, 'record.json');
  await fs.writeFile(record, '{"version":1,"value":"untouched"}');
  await fs.symlink(record, recordPath(root, 'drafts', 'linked'));
  await assert.rejects(() => vault.readRecord('drafts', 'linked'), code('ERR_VAULT_UNSAFE_PATH'));
  await assert.rejects(() => vault.writeRecord('drafts', 'linked', 'overwritten'), code('ERR_VAULT_UNSAFE_PATH'));
  assert.equal(await fs.readFile(record, 'utf8'), '{"version":1,"value":"untouched"}');
  const data = Buffer.from('external object');
  const ref = refFor(data);
  const target = join(outside, 'external-object');
  await fs.writeFile(target, data);
  await fs.symlink(target, objectPath(root, ref));
  await assert.rejects(() => vault.capture('symlink', eventFor([{ type: 'file', attachment: ref }]), hostFor([[ref, data]])), code('ERR_VAULT_UNSAFE_PATH'));
  assert.equal(await vault.readRecord('snapshots', 'symlink:1'), null);
  await fs.rmdir(join(root, 'operations'));
  await fs.symlink(outside, join(root, 'operations'), 'dir');
  await assert.rejects(() => vault.writeRecord('operations', 'escape', {}), code('ERR_VAULT_UNSAFE_PATH'));
  await assert.rejects(() => new Vault(root).init(), code('ERR_VAULT_UNSAFE_PATH'));
  assert.deepEqual((await fs.readdir(outside)).sort(), ['external-object', 'record.json']);
});

test('init creates missing nested directories and rejects regular files used as directories', async (t) => {
  const { root } = await fixture(t);
  const nested = new Vault(join(root, 'new', 'deep', 'vault'));
  await Promise.all([nested.init(), nested.init()]);
  await nested.writeRecord('operations', 'ok', { ready: true });
  assert.deepEqual(await nested.readRecord('operations', 'ok'), { ready: true });
  const file = join(root, 'not-directory');
  await fs.writeFile(file, 'keep');
  await assert.rejects(() => new Vault(file).init());
  assert.equal(await fs.readFile(file, 'utf8'), 'keep');
});

// Instrument only these tests' filesystem calls; do not alter project configuration or runtime code.
function instrumentFilesystem(t, overrides) {
  for (const [name, implementation] of Object.entries(overrides)) t.mock.method(fs, name, implementation);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

test('publishing fsyncs temporary data before rename and then syncs the parent directory', async (t) => {
  const { root, vault } = await fixture(t);
  const actualOpen = fs.open;
  const actualRename = fs.rename;
  const steps = [];
  instrumentFilesystem(t, {
    async open(path, ...args) {
      const handle = await actualOpen(path, ...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => { steps.push(['sync', path]); return await sync(); };
      return handle;
    },
    async rename(from, to) { steps.push(['rename', from, to]); return await actualRename(from, to); },
  });
  await vault.writeRecord('operations', 'durable', { done: true });
  assert.equal(steps.length, 3);
  assert.equal(steps[0][0], 'sync');
  assert.ok(steps[0][1].endsWith('.tmp'));
  assert.deepEqual(steps[1], ['rename', steps[0][1], recordPath(root, 'operations', 'durable')]);
  assert.deepEqual(steps[2], ['sync', join(root, 'operations')]);
  await noTemporary(root);
});

test('file fsync/rename failures preserve the old record, propagate original errors, and remove own temp files', async (t) => {
  for (const mode of ['sync', 'rename']) {
    await t.test(mode, async (t) => {
      const { root, vault } = await fixture(t);
      await vault.writeRecord('operations', 'stable', { old: true });
      const failure = Object.assign(new Error(`injected ${mode} error`), { code: 'EIO' });
      const actualOpen = fs.open;
      instrumentFilesystem(t, mode === 'rename' ? { async rename() { throw failure; } } : {
        async open(path, ...args) {
          const handle = await actualOpen(path, ...args);
          if (path.endsWith('.tmp')) handle.sync = async () => { throw failure; };
          return handle;
        },
      });
      await assert.rejects(() => vault.writeRecord('operations', 'stable', { new: true }), (cause) => cause === failure);
      assert.deepEqual(await vault.readRecord('operations', 'stable'), { old: true });
      await noTemporary(root);
    });
  }
});

test('directory fsync errors are explicit and never roll back/delete already renamed data', async (t) => {
  for (const errno of ['EIO', 'EACCES', ...(process.platform === 'win32' ? [] : ['EINVAL', 'ENOTSUP'])]) {
    await t.test(errno, async (t) => {
      const { root, vault } = await fixture(t);
      const failure = Object.assign(new Error('directory sync failed'), { code: errno });
      const actualOpen = fs.open;
      instrumentFilesystem(t, {
        async open(path, ...args) {
          const handle = await actualOpen(path, ...args);
          if (path === join(root, 'operations')) handle.sync = async () => { throw failure; };
          return handle;
        },
      });
      await assert.rejects(() => vault.writeRecord('operations', 'renamed', { retained: true }), (cause) => cause === failure);
      assert.deepEqual(await vault.readRecord('operations', 'renamed'), { retained: true });
      await noTemporary(root);
    });
  }
});

test('arbitrary string keys including lone surrogates do not collide through UTF-8 replacement', async (t) => {
  const { root, vault } = await fixture(t);
  const keys = ['\ud800', '\ud801', '\udfff', '\ufffd', '\\ud800'];
  for (const key of keys) await vault.writeRecord('operations', key, { key });
  for (const key of keys) assert.deepEqual(await vault.readRecord('operations', key), { key });
  const names = await fs.readdir(join(root, 'operations'));
  assert.equal(names.length, keys.length);
  assert.ok(names.every((name) => /^[a-f0-9]{64}\.json$/.test(name)));
});

test('capture fsync failures and cancellation just before snapshot rename retain text and valid objects', async (t) => {
  for (const stage of ['object-sync', 'snapshot-sync', 'snapshot-abort']) {
    await t.test(stage, async (t) => {
      const { root, vault } = await fixture(t);
      const data = Buffer.from('durable attachment');
      const ref = refFor(data);
      const event = eventFor([{ type: 'text', text: 'durable text' }, { type: 'file', attachment: ref }]);
      const failure = Object.assign(new Error(stage), { code: 'EIO' });
      const controller = new AbortController();
      const actualOpen = fs.open;
      const directory = join(root, stage === 'object-sync' ? 'objects' : 'snapshots');
      instrumentFilesystem(t, {
        async open(path, ...args) {
          const handle = await actualOpen(path, ...args);
          if (dirname(path) === directory && path.endsWith('.tmp')) {
            const sync = handle.sync.bind(handle);
            handle.sync = async () => {
              if (stage !== 'snapshot-abort') throw failure;
              await sync();
              controller.abort(failure);
            };
          }
          return handle;
        },
      });
      await assert.rejects(() => vault.capture('durability', event, hostFor([[ref, data]]), controller.signal), (cause) => cause === failure);
      assert.deepEqual((await vault.readRecord('drafts', 'durability:1')).event, event);
      assert.equal(await vault.readRecord('snapshots', 'durability:1'), null);
      if (stage === 'object-sync') assert.deepEqual(await fs.readdir(join(root, 'objects')), []);
      else assert.deepEqual(await fs.readFile(objectPath(root, ref)), data);
      await noTemporary(root);
    });
  }
});

test('Windows relies on metadata journaling but still propagates every file fsync failure', async (t) => {
  for (const errno of ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EISDIR', 'EBADF', 'EPERM']) {
    await t.test(errno, async (t) => {
      const { root, vault } = await fixture(t);
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
      t.after(() => Object.defineProperty(process, 'platform', descriptor));
      const failure = Object.assign(new Error('directory unsupported'), { code: errno });
      const actualOpen = fs.open;
      let target = join(root, 'operations');
      instrumentFilesystem(t, {
        async open(path, ...args) {
          const handle = await actualOpen(path, ...args);
          if (path === target || (target === 'temporary' && path.endsWith('.tmp'))) handle.sync = async () => { throw failure; };
          return handle;
        },
      });
      await vault.writeRecord('operations', errno, { saved: true });
      assert.deepEqual(await vault.readRecord('operations', errno), { saved: true });
      target = 'temporary';
      await assert.rejects(() => vault.writeRecord('operations', errno, { replaced: true }), (cause) => cause === failure);
      assert.deepEqual(await vault.readRecord('operations', errno), { saved: true });
      await noTemporary(root);
    });
  }
});
