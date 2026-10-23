import React, { useEffect, useRef, useState } from 'react';
import { callRecovery, DraftWriter } from './transport.js';
import { translations } from './locale.js';
import { css } from './styles.js';

const NS = 'dsh-content-rollback';
export const inject = ['slots', 'locale', 'remote', 'remote.commands'];
const QUOTE_LIMIT = 4000;
const PRIMARY_MODIFIER = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform ?? '') ? '⌘' : 'Ctrl';

function errorText(t, code) {
  return translations.en[`errors.${code}`] ? t(`errors.${code}`) : t('error', { code });
}

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function RecoveryIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8h10a6 6 0 0 1 0 12H9M5 8l4-4M5 8l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function QuoteIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 7H5v6h4c0 2-1 3-3 4M19 7h-4v6h4c0 2-1 3-3 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function useSelection() {
  const [selection, setSelection] = useState('');
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setSelection(''); return; }
      const node = sel.anchorNode;
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      if (element?.closest?.('.dcr')) return;
      const text = sel.toString().replace(/\s+$/, '').trim();
      setSelection(text.length > QUOTE_LIMIT ? text.slice(0, QUOTE_LIMIT) : text);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read); };
    document.addEventListener('selectionchange', schedule);
    return () => { document.removeEventListener('selectionchange', schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return [selection, setSelection];
}

function QuoteReply({ quote, request, onClose, onSent, t }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(newRequestId());
  const area = useRef(null);
  useEffect(() => { area.current?.focus(); }, []);
  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await request({ action: 'reply', text, quote, requestId: requestId.current });
      setText('');
      onSent();
    } catch (cause) {
      setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      setBusy(false);
    }
  }
  return <div className="dcr-reply" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); }
  }}>
    <div className="dcr-quote">
      <div className="dcr-quote-head"><QuoteIcon /><span>{t('quotedSelection', { count: quote.length })}</span><button type="button" onClick={onClose} aria-label={t('close')}>×</button></div>
      <blockquote className="dcr-quote-body">{quote}</blockquote>
    </div>
    <textarea ref={area} value={text} onChange={(event) => setText(event.target.value)} placeholder={t('replyPlaceholder')} aria-label={t('replyPlaceholder')} spellCheck={false} />
    {error && <p className="dcr-error" role="alert">{errorText(t, error)}</p>}
    <div className="dcr-reply-foot">
      <span className="dcr-hint">{PRIMARY_MODIFIER}↵ {t('sendHint')} · Esc {t('cancelHint')}</span>
      <div className="dcr-actions">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="dcr-primary" disabled={busy || !text.trim()} onClick={() => void send()}>{t(busy ? 'working' : 'replySend')}</button>
      </div>
    </div>
  </div>;
}

function Panel({ sessionId, remote, t }) {
  const [expanded, setExpanded] = useState(false);
  const [listing, setListing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [stop, setStop] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [quote, setQuote] = useState('');
  const [selection, setSelection] = useSelection();
  const active = useRef(true);
  const inFlight = useRef(false);
  const writer = useRef(null);
  const trigger = useRef(null);
  const saveGeneration = useRef(0);
  const request = (value) => callRecovery(typeof fetch === 'function' ? fetch.bind(globalThis) : null, remote, sessionId, value);
  const report = (cause) => { if (active.current) { setError(cause.code ?? 'RECOVERY_FAILED'); setErrorDetail(cause.message ?? null); } };
  useEffect(() => { active.current = true; return () => { active.current = false; void writer.current?.flush().catch(() => {}); }; }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => { if (active.current) setNotice(null); }, 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    try { return await action(); }
    catch (cause) { report(cause); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  async function refresh(more = false) {
    const result = await request({ action: 'list', ...(more && listing?.items.length ? { before: listing.items.at(-1).seq } : {}) });
    if (active.current) setListing(more ? { ...result, items: [...listing.items, ...result.items] } : result);
    return result;
  }
  useEffect(() => { void run(() => refresh()); }, []);

  function quoteSelection() {
    if (!selection) return;
    setQuote(selection);
    setExpanded(true);
    setSelection('');
    window.getSelection()?.removeAllRanges();
  }

  function applyDraft(result) {
    const storage = { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: (key) => window.localStorage.removeItem(key) };
    const draftWriter = new DraftWriter(result.token, result.revision ?? 0, request, storage);
    writer.current = draftWriter;
    setConflict(null);
    let next = result.content;
    setSaveState('saved');
    try {
      const local = JSON.parse(storage.getItem(`dsh-rollback:${result.token}`) ?? 'null');
      if (Array.isArray(local?.edits) && local.edits.every((item) => typeof item === 'string') && local.edits.length === next.filter((part) => part.type === 'text').length && ['prepared', 'ready'].includes(result.state)) {
        let index = 0;
        const recovered = next.map((part) => part.type === 'text' ? { ...part, text: local.edits[index++] } : part);
        if (local.revision !== result.revision && JSON.stringify(recovered) !== JSON.stringify(next)) {
          setConflict(recovered);
          setSaveState('saveFailed');
        } else {
          next = recovered;
          persist(next, draftWriter);
        }
      }
    } catch { /* The Host draft remains authoritative if browser storage is unavailable. */ }
    setSelected({ ...result, originalContent: result.originalContent ?? result.content });
    if (result.error) { setError(result.error); setErrorDetail(null); }
    setContent(next);
    setStop(false);
    setExpanded(true);
  }

  async function choose(seq) {
    await writer.current?.flush();
    const result = await request({ action: 'prepare', seq });
    if (active.current) applyDraft(result);
  }
  async function resume(token) {
    await writer.current?.flush();
    const result = await request({ action: 'load-draft', token });
    if (active.current) applyDraft(result);
  }
  function persist(next, target = writer.current) {
    const generation = ++saveGeneration.current;
    setSaveState('saving');
    void target.save(next.filter((part) => part.type === 'text').map((part) => part.text)).then(() => {
      if (active.current && generation === saveGeneration.current) setSaveState('saved');
    }, (cause) => {
      if (active.current && generation === saveGeneration.current) { setSaveState('saveFailed'); report(cause); }
    });
  }
  function edit(index, text) {
    const next = content.map((part, i) => i === index ? { ...part, text } : part);
    setContent(next);
    persist(next);
  }
  async function execute(mode) {
    await writer.current?.flush();
    const result = await request({ action: 'execute', token: selected.token, mode, stop, route: listing?.route, ...(mode === 'send' ? { revision: writer.current?.revision ?? 0 } : {}) });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) { setError(result.error); setErrorDetail(null); }
    await refresh();
  }
  async function check() {
    const result = await request({ action: 'status', token: selected.token });
    if (active.current) setSelected((previous) => ({ ...previous, ...result }));
  }
  const finished = selected && ['accepted', 'sending', 'uncertain'].includes(selected.state);
  const canEdit = selected?.state === 'ready';
  const close = () => { setExpanded(false); trigger.current?.focus(); };
  const sendQuote = () => {
    setQuote('');
    setNotice(t('replySent'));
  };

  return <section className="dcr" aria-label={t('title')} onKeyDown={(event) => {
    if (event.key === 'Escape' && expanded && !quote && !event.nativeEvent.isComposing) { event.stopPropagation(); close(); }
  }}>
    <style>{css}</style>
    <div className="dcr-bar">
      <button ref={trigger} type="button" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); if (!expanded) void run(() => refresh()); }}><RecoveryIcon />{t('title')}</button>
      <span className="dcr-tagline">{t('tagline')}</span>
      <div className="dcr-bar-actions">
        {selection && <button type="button" className="dcr-quote-trigger" title={t('quoteHint')} onPointerDown={(event) => event.preventDefault()} onClick={quoteSelection}><QuoteIcon />{t('quoteSelection')}</button>}
        {!expanded && listing?.pending && <button type="button" disabled={busy} onClick={() => void run(() => resume(listing.pending.token))}>{t('resume')}</button>}
      </div>
    </div>
    {expanded && <div className="dcr-panel" aria-busy={busy}>
      <header className="dcr-head"><h3>{t(selected ? 'original' : 'history')}</h3><div className="dcr-actions">
        {selected && <button type="button" disabled={busy || saveState === 'saving'} onClick={() => void run(async () => { await writer.current?.flush(); setSelected(null); await refresh(); })}>{t('back')}</button>}
        <button type="button" disabled={busy} onClick={() => void run(() => refresh())}>{t('refresh')}</button>
        <button type="button" onClick={close} aria-label={t('close')}>×</button>
      </div></header>
      {quote && <QuoteReply quote={quote} request={request} onClose={() => setQuote('')} onSent={sendQuote} t={t} />}
      {notice && <div className="dcr-notice" role="status">{notice}</div>}
      {selection && !quote && <div className="dcr-quote-prompt"><span>{t('selectionAvailable', { count: selection.length })}</span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={quoteSelection}>{t('quoteSelection')}</button></div>}
      {error && <div className="dcr-error" role="alert">{errorText(t, error)}{!translations.en[`errors.${error}`] && errorDetail && <span className="dcr-muted"> · {errorDetail}</span>}{error === 'DRAFT_CONFLICT' && selected && <button type="button" onClick={() => void run(async () => { const result = await request({ action: 'load-draft', token: selected.token }); if (active.current) applyDraft(result); })}>{t('reloadDraft')}</button>}</div>}
      {listing?.archiveIssue && <div className="dcr-error" role="status">{t('backupIssue', { code: listing.archiveIssue })}</div>}
      {!selected ? <div className="dcr-scroll">
        {listing?.pending && <div className="dcr-body"><button type="button" disabled={busy} onClick={() => void run(() => resume(listing.pending.token))}>{t('resume')}</button></div>}
        {!listing ? <div className="dcr-empty">{t('loading')}</div> : listing.items.length === 0 ? <div className="dcr-empty">{t('empty')}</div> : <ol className="dcr-list">
          {listing.items.map((item) => <li key={item.seq}><button type="button" disabled={busy} onClick={() => void run(() => choose(item.seq))}>
            <span className="dcr-preview">{item.preview || t('attachmentOnly')}</span>
            <span className="dcr-meta"><time>{new Date(item.time).toLocaleString()}</time><span>#{item.seq}</span>{item.attachments.map((part, i) => <span key={i}>{part.name || t(part.type === 'image' ? 'image' : 'file')}</span>)}</span>
          </button></li>)}
        </ol>}
        {listing?.hasMore && <div className="dcr-body"><button type="button" disabled={busy} onClick={() => void run(() => refresh(true))}>{t('more')}</button></div>}
      </div> : <>
        <div className="dcr-scroll">
          <div className="dcr-body">
            <p className="dcr-note">{t('scope')}</p>
            {selected.toolCalls > 0 && <p className="dcr-note dcr-warning">{t('tools', { count: selected.toolCalls })}</p>}
            {content.some((part) => part.type !== 'text') && <p className="dcr-note">{t('media')}</p>}
            {selected.hasPathReferences && <p className="dcr-note dcr-warning">{t('paths')}</p>}
            {conflict && <div className="dcr-warning"><p>{t('conflict')}</p><pre className="dcr-preview">{conflict.filter((part) => part.type === 'text').map((part) => part.text).join('\n')}</pre><div className="dcr-actions"><button type="button" onClick={() => { setContent(conflict); persist(conflict); setConflict(null); }}>{t('useLocal')}</button><button type="button" onClick={() => { try { window.localStorage.removeItem(`dsh-rollback:${selected.token}`); } catch {} setConflict(null); setSaveState('saved'); }}>{t('useSaved')}</button></div></div>}
            {content.map((part, index) => part.type === 'text' ? <label className="dcr-block" key={index}>
              <span className="dcr-block-label">{t('part', { index: index + 1 })}</span>
              <textarea value={part.text} readOnly={!canEdit || busy || Boolean(conflict)} onChange={(event) => edit(index, event.target.value)} spellCheck={false} />
            </label> : <div className="dcr-chip" key={index}><span>{t(part.type === 'image' ? 'image' : 'file')} · {part.attachment?.name || part.attachment?.attachmentId}</span><span className="dcr-muted">{part.attachment?.bytes ?? 0} B</span></div>)}
            <p className="dcr-note">{t('preserveDraft')}</p>
            {canEdit && <div className="dcr-actions">
              <span role="status" aria-live="polite">{t(saveState)}</span>
              <button type="button" disabled={busy || Boolean(conflict)} onClick={() => { const next = structuredClone(selected.originalContent); setContent(next); persist(next); }}>{t('restore')}</button>
              {saveState === 'saveFailed' && !conflict && <button type="button" onClick={() => persist(content)}>{t('retrySave')}</button>}
            </div>}
            {!finished && <label className="dcr-check"><input type="checkbox" checked={stop} onChange={(event) => setStop(event.target.checked)} />{t('stop')}</label>}
          </div>
          {finished && <div className="dcr-status" role="status">
            <p>{t(selected.state === 'accepted' ? 'accepted' : 'uncertain')}</p>
            {selected.state !== 'accepted' && <div className="dcr-actions"><button type="button" disabled={busy} onClick={() => void run(check)}>{t('check')}</button></div>}
          </div>}
        </div>
        {!finished && <footer className="dcr-foot"><span className="dcr-muted">{t('model')} · {listing?.route?.model ?? t('noModel')}</span><div className="dcr-actions">
          {selected.state === 'prepared' && <><button type="button" className="dcr-primary" disabled={busy} onClick={() => void run(() => execute('retry'))}>{t(busy ? 'working' : 'retry')}</button><button type="button" disabled={busy} onClick={() => void run(() => execute('edit'))}>{t(busy ? 'working' : 'edit')}</button></>}
          {canEdit && <button type="button" className="dcr-primary" disabled={busy || saveState !== 'saved'} onClick={() => void run(() => execute('send'))}>{t(busy ? 'working' : 'send')}</button>}
        </div></footer>}
      </>}
    </div>}
  </section>;
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, translations));
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: NS, order: 20, locale: NS,
  }, (props) => props.sessionId ? <Panel key={props.sessionId} sessionId={props.sessionId} remote={ctx.remote} t={props.t} /> : null));
}
