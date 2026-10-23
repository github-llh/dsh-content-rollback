import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { callRecovery, DraftWriter } from './transport.js';
import { translations } from './locale.js';
import { css } from './styles.js';

const NS = 'dsh-content-rollback';
export const inject = ['slots', 'locale', 'remote', 'remote.commands'];
const QUOTE_LIMIT = 4000;
const PRIMARY_MODIFIER = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '') ? '⌘' : 'Ctrl';

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

const Icon = ({ children, size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>;
const RecoveryIcon = () => <Icon><path d="M5 8h10a6 6 0 0 1 0 12H9M5 8l4-4M5 8l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const QuoteIcon = () => <Icon size={14}><path d="M9 7H5v6h4c0 2-1 3-3 4M19 7h-4v6h4c0 2-1 3-3 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const RetryIcon = () => <Icon size={14}><path d="M4 11a8 8 0 1 1 2.3 5.7M4 5v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const EditIcon = () => <Icon size={14}><path d="M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const SendIcon = () => <Icon size={14}><path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const CheckIcon = () => <Icon size={16}><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const InfoIcon = () => <Icon size={16}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 11v5m0-8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;
const ChevronIcon = () => <Icon size={13}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;

function AutoTextarea({ value, onChange, readOnly, label, autoFocus, placeholder }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [value]);
  useEffect(() => {
    if (!autoFocus) return;
    const element = ref.current;
    if (element) { element.focus(); element.setSelectionRange(element.value.length, element.value.length); }
  }, [autoFocus]);
  return <textarea ref={ref} rows={1} value={value} readOnly={readOnly} aria-label={label} placeholder={placeholder} onChange={onChange} spellCheck={false} />;
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
    <AutoTextarea value={text} onChange={(event) => setText(event.target.value)} label={t('replyPlaceholder')} placeholder={t('replyPlaceholder')} autoFocus />
    {error && <p className="dcr-error" role="alert">{errorText(t, error)}</p>}
    <div className="dcr-reply-foot">
      <span className="dcr-hint">{PRIMARY_MODIFIER}↵ {t('sendHint')} · Esc {t('cancelHint')}</span>
      <div className="dcr-actions">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="dcr-primary" disabled={busy || !text.trim()} onClick={() => void send()}><SendIcon />{t(busy ? 'working' : 'replySend')}</button>
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
  const [editing, setEditing] = useState(false);
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
    setEditing(result.state === 'ready');
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
  async function beginEdit() {
    if (selected.state !== 'prepared') { setEditing(true); return; }
    const result = await request({ action: 'execute', token: selected.token, mode: 'edit' });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) { setError(result.error); setErrorDetail(null); return; }
    setEditing(true);
  }
  async function execute(mode) {
    await writer.current?.flush();
    const result = await request({ action: 'execute', token: selected.token, mode, stop, route: listing?.route, ...(mode === 'send' ? { revision: writer.current?.revision ?? 0 } : {}) });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) { setError(result.error); setErrorDetail(null); }
    if (['accepted', 'uncertain', 'sending'].includes(result.state)) setEditing(false);
    await refresh();
  }
  async function check() {
    const result = await request({ action: 'status', token: selected.token });
    if (active.current) setSelected((previous) => ({ ...previous, ...result }));
  }
  function backToList() {
    setEditing(false);
    setSelected(null);
    void run(() => refresh());
  }

  const finished = selected && ['accepted', 'sending', 'uncertain'].includes(selected.state);
  const canEdit = selected?.state === 'ready';
  const isEditing = Boolean(editing && canEdit);
  const close = () => { setExpanded(false); trigger.current?.focus(); };
  const sendQuote = () => { setQuote(''); setNotice(t('replySent')); };
  const activity = listing?.activity;
  const firstTextIndex = content.findIndex((part) => part.type === 'text');
  const textCount = content.filter((part) => part.type === 'text').length;
  let textIndex = 0;

  return <section className="dcr" aria-label={t('title')} onKeyDown={(event) => {
    if (!expanded) return;
    if (event.key === 'Escape' && !quote) {
      if (isEditing) { event.stopPropagation(); setEditing(false); }
      else { event.stopPropagation(); close(); }
    } else if (isEditing && event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy && !conflict && saveState !== 'saveFailed') {
      event.preventDefault();
      void run(() => execute('send'));
    }
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
      <header className="dcr-head">
        <div className="dcr-head-main">
          {selected && <button type="button" className="dcr-iconbtn" aria-label={t('backList')} title={t('backList')} onClick={backToList}>←</button>}
          <h3>{selected ? (isEditing ? t('editTitle') : t('recoveredTitle')) : t('history')}</h3>
        </div>
        <div className="dcr-actions">
          <button type="button" className="dcr-ghost" disabled={busy} onClick={() => void run(() => refresh())}>{t('refresh')}</button>
          <button type="button" className="dcr-iconbtn" onClick={close} aria-label={t('close')}>×</button>
        </div>
      </header>
      {quote && <QuoteReply quote={quote} request={request} onClose={() => setQuote('')} onSent={sendQuote} t={t} />}
      {notice && <div className="dcr-notice" role="status"><CheckIcon />{notice}</div>}
      {selection && !quote && <div className="dcr-quote-prompt"><span>{t('selectionAvailable', { count: selection.length })}</span><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={quoteSelection}><QuoteIcon />{t('quoteSelection')}</button></div>}
      {error && <div className="dcr-error" role="alert">{errorText(t, error)}{!translations.en[`errors.${error}`] && errorDetail && <span className="dcr-muted"> · {errorDetail}</span>}{error === 'DRAFT_CONFLICT' && selected && <button type="button" className="dcr-link" onClick={() => void run(async () => { const result = await request({ action: 'load-draft', token: selected.token }); if (active.current) applyDraft(result); })}>{t('reloadDraft')}</button>}</div>}
      {listing?.archiveIssue && <div className="dcr-error" role="status">{t('backupIssue', { code: listing.archiveIssue })}</div>}
      {!selected ? <div className="dcr-scroll">
        {listing?.pending && <div className="dcr-banner"><div><strong>{t('pendingResume')}</strong><span className="dcr-muted">#{listing.pending.seq}</span></div><button type="button" disabled={busy} onClick={() => void run(() => resume(listing.pending.token))}>{t('resume')}</button></div>}
        {!listing ? <div className="dcr-skeleton" aria-label={t('loading')}>{[0, 1, 2].map((row) => <span key={row} />)}</div> : listing.items.length === 0 ? <div className="dcr-empty"><RecoveryIcon /><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div> : <ol className="dcr-list">
          {listing.items.map((item) => <li key={item.seq}><button type="button" disabled={busy} onClick={() => void run(() => choose(item.seq))}>
            <span className="dcr-preview">{item.preview || t('attachmentOnly')}</span>
            <span className="dcr-meta"><time>{new Date(item.time).toLocaleString()}</time><span>#{item.seq}</span>{item.attachments.map((part, i) => <span key={i}>{part.name || t(part.type === 'image' ? 'image' : 'file')}</span>)}</span>
            <span className="dcr-list-chevron"><ChevronIcon /></span>
          </button></li>)}
        </ol>}
        {listing?.hasMore && <div className="dcr-body"><button type="button" className="dcr-ghost" disabled={busy} onClick={() => void run(() => refresh(true))}>{t('more')}</button></div>}
      </div> : <>
        <div className="dcr-scroll">
          <div className="dcr-body">
            <article className="dcr-message">
              <header className="dcr-message-head">
                <span className="dcr-avatar">{t('you')}</span>
                <div className="dcr-message-meta">
                  <strong>{t('you')}</strong>
                  <span>{selected.time ? new Date(selected.time).toLocaleString() : ''}{selected.time ? ' · ' : ''}#{selected.seq}</span>
                </div>
                {selected.toolCalls > 0 && <span className="dcr-warn-chip">{t('toolChip', { count: selected.toolCalls })}</span>}
              </header>
              <div className="dcr-message-body">
                {content.map((part, index) => part.type === 'text' ? <div className="dcr-textblock" key={index}>
                  {isEditing && textCount > 1 && <span className="dcr-textlabel">{t('part', { index: ++textIndex })}</span>}
                  {isEditing ? <AutoTextarea value={part.text} readOnly={busy || Boolean(conflict)} label={t('part', { index: textIndex || 1 })} autoFocus={index === firstTextIndex} onChange={(event) => edit(index, event.target.value)} /> : <p className="dcr-message-text">{part.text}</p>}
                </div> : <div className="dcr-chip" key={index}><span>{t(part.type === 'image' ? 'image' : 'file')} · {part.attachment?.name || part.attachment?.attachmentId}</span><span className="dcr-muted">{part.attachment?.bytes ?? 0} B</span></div>)}
              </div>
              {isEditing && <div className="dcr-edit-tools">
                <span role="status" aria-live="polite">{t(saveState)}</span>
                <button type="button" className="dcr-link" disabled={busy || Boolean(conflict)} onClick={() => { const next = structuredClone(selected.originalContent); setContent(next); persist(next); }}>{t('restore')}</button>
                <button type="button" className="dcr-link" onClick={() => setEditing(false)}>{t('finishEdit')}</button>
              </div>}
              {conflict && <div className="dcr-warning"><p>{t('conflict')}</p><pre className="dcr-preview">{conflict.filter((part) => part.type === 'text').map((part) => part.text).join('\n')}</pre><div className="dcr-actions"><button type="button" onClick={() => { setContent(conflict); persist(conflict); setConflict(null); }}>{t('useLocal')}</button><button type="button" onClick={() => { try { window.localStorage.removeItem(`dsh-rollback:${selected.token}`); } catch {} setConflict(null); setSaveState('saved'); }}>{t('useSaved')}</button></div></div>}
            </article>
            {!finished && <details className="dcr-details">
              <summary><ChevronIcon />{t('impact')}</summary>
              <p className="dcr-note">{t('scope')}</p>
              {selected.toolCalls > 0 && <p className="dcr-note dcr-warning">{t('tools', { count: selected.toolCalls })}</p>}
              {content.some((part) => part.type !== 'text') && <p className="dcr-note">{t('media')}</p>}
              {selected.hasPathReferences && <p className="dcr-note dcr-warning">{t('paths')}</p>}
              <p className="dcr-note">{t('preserveDraft')}</p>
            </details>}
            {activity?.running && <label className="dcr-check"><input type="checkbox" checked={stop} onChange={(event) => setStop(event.target.checked)} /><span>{t('stopFirst')}<small>{t('stopHint')}</small></span></label>}
            {activity?.queued > 0 && <p className="dcr-note dcr-warning">{t('queueChip', { count: activity.queued })}</p>}
          </div>
          {finished && <div className="dcr-status dcr-status-card" role="status">
            <div className="dcr-status-line">
              <span className={selected.state === 'accepted' ? 'dcr-ok' : 'dcr-pending-icon'}>{selected.state === 'accepted' ? <CheckIcon /> : <InfoIcon />}</span>
              <div>
                <strong>{t(selected.state === 'accepted' ? 'sentToSession' : selected.state === 'sending' ? 'sendingState' : 'uncertainTitle')}</strong>
                {selected.state === 'uncertain' && <p>{t('uncertain')}</p>}
                {selected.state === 'accepted' && <p>{t('accepted')}</p>}
              </div>
            </div>
            <div className="dcr-actions">
              {selected.state === 'uncertain' && <button type="button" className="dcr-ghost" disabled={busy} onClick={() => void run(check)}>{t('checkResult')}</button>}
              <button type="button" className="dcr-primary" onClick={backToList}>{t('backList')}</button>
            </div>
          </div>}
        </div>
        {!finished && <footer className="dcr-foot">
          <div className="dcr-footmeta">
            <span className="dcr-model">{t('model')} · {listing?.route?.model ?? t('noModel')}</span>
            {isEditing && <span className="dcr-hint">{t('editHint', { modifier: PRIMARY_MODIFIER })}</span>}
          </div>
          <div className="dcr-actions">
            {(selected.state === 'prepared' || selected.state === 'ready') && <button type="button" className="dcr-ghost" title={t('retryHint')} disabled={busy} onClick={() => void run(() => execute('retry'))}><RetryIcon />{t('retryOriginal')}</button>}
            {selected.state === 'prepared' && <button type="button" className="dcr-primary" disabled={busy} onClick={() => void run(beginEdit)}><EditIcon />{t(busy ? 'working' : 'editAction')}</button>}
            {selected.state === 'ready' && !isEditing && <button type="button" className="dcr-ghost" disabled={busy} onClick={() => setEditing(true)}><EditIcon />{t('continueEdit')}</button>}
            {selected.state === 'ready' && <button type="button" className="dcr-primary" disabled={busy || Boolean(conflict) || saveState === 'saveFailed'} onClick={() => void run(() => execute('send'))}><SendIcon />{t(busy ? 'working' : 'sendEdited')}</button>}
          </div>
        </footer>}
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
