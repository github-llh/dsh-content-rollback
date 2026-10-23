import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { callRecovery } from './transport.js';
import { translations } from './locale.js';
import { css } from './styles.js';

const NS = 'dsh-content-rollback';
const QUOTE_LIMIT = 4000;
const EDITOR_MAX_HEIGHT = 240;
export const inject = ['slots', 'locale', 'remote', 'remote.commands'];
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

function requestIdFor(ref, signature) {
  if (ref.current.signature === signature && ref.current.id) return ref.current.id;
  const id = newRequestId();
  ref.current = { id, signature };
  return id;
}

function resetRequestId(ref) {
  ref.current = { id: null, signature: null };
}

const Icon = ({ children, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>;
const HistoryIcon = () => <Icon size={17}><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4.5V10h5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8v4.2l2.8 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const EditIcon = () => <Icon size={15}><path d="M4.5 19.5h4l10-10-4-4-10 10v4Zm9-13 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const ResendIcon = () => <Icon size={15}><path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3M4.5 5v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const RetryIcon = () => <Icon size={17}><path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3M4.5 5v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const CopyIcon = () => <Icon size={14}><rect x="8.5" y="8.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M15.5 8.5V6.8c0-1-.8-1.8-1.8-1.8H6.8c-1 0-1.8.8-1.8 1.8v6.9c0 1 .8 1.8 1.8 1.8h1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></Icon>;
const CheckIcon = () => <Icon size={14}><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const CloseIcon = () => <Icon size={15}><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></Icon>;
const BackIcon = () => <Icon size={16}><path d="M19 12H5m0 0 6-6m-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const ChevronIcon = () => <Icon size={14}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const RefreshIcon = () => <Icon size={15}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V10h-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const QuoteIcon = () => <Icon size={15}><path d="M9 7H5v6h4c0 2-1 3-3 4M19 7h-4v6h4c0 2-1 3-3 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const SendIcon = () => <Icon size={13}><path d="M12 19V5m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
const WarnIcon = () => <Icon size={14}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;

const Spinner = () => <span className="dcr-spinner" aria-hidden="true" />;

function IconButton({ label, title, onClick, disabled, busy, children }) {
  return <button type="button" className="dcr-icon-btn" aria-label={label} title={title ?? label} disabled={disabled} onClick={onClick}>{busy ? <Spinner /> : children}</button>;
}

function ToolButton({ label, onClick, active, onPointerDown, children }) {
  return <button type="button" className="dcr-tool" aria-label={label} title={label} aria-expanded={active || undefined} data-dcr-trigger="" onPointerDown={onPointerDown} onClick={onClick}>{children}</button>;
}

function timeText(time) {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function whenText(time) {
  const date = new Date(time);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeText(time);
  return date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function prepareContent(content) {
  const texts = [];
  const attachments = [];
  const extraBlocks = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') texts.push(block.text);
    else if (block?.type === 'image' && block.attachment) attachments.push({ type: 'image', image: { attachment: block.attachment } });
    else if (block?.type === 'file' && block.attachment) attachments.push({ type: 'file', file: block.attachment });
    else extraBlocks.push(block);
  }
  return { text: texts.join(''), attachments, extraBlocks };
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
      if (element?.closest?.('.dcr-chrome, [contenteditable="true"], textarea, input')) return;
      const text = sel.toString().replace(/\s+$/, '').trim();
      setSelection(text.length > QUOTE_LIMIT ? text.slice(0, QUOTE_LIMIT) : text);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(read); };
    document.addEventListener('selectionchange', schedule);
    return () => { document.removeEventListener('selectionchange', schedule); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return selection;
}

const uiBySession = new Map();
const uiListeners = new Map();

function uiOf(sessionId) {
  return uiBySession.get(sessionId) ?? { open: false, quote: '' };
}

function updateUi(sessionId, patch) {
  uiBySession.set(sessionId, { ...uiOf(sessionId), ...patch });
  for (const listener of uiListeners.get(sessionId) ?? []) listener();
}

function useUi(sessionId) {
  const [value, setValue] = useState(() => uiOf(sessionId));
  const dispatch = useCallback((patch) => updateUi(sessionId, patch), [sessionId]);
  useEffect(() => {
    setValue(uiOf(sessionId));
    let listeners = uiListeners.get(sessionId);
    if (!listeners) { listeners = new Set(); uiListeners.set(sessionId, listeners); }
    const listener = () => setValue(uiOf(sessionId));
    listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) uiListeners.delete(sessionId); };
  }, [sessionId]);
  return [value, dispatch];
}

let toastSeq = 0;
let toastItems = [];
const toastListeners = new Set();

function removeToast(id) {
  toastItems = toastItems.filter((item) => item.id !== id);
  for (const listener of toastListeners) listener();
}

function pushToast(kind, text) {
  const item = { id: ++toastSeq, kind, text };
  toastItems = [...toastItems, item];
  for (const listener of toastListeners) listener();
  setTimeout(() => removeToast(item.id), kind === 'error' ? 6000 : 3200);
}

function ToastHost({ t }) {
  const [items, setItems] = useState(toastItems);
  useEffect(() => {
    const listener = () => setItems(toastItems);
    toastListeners.add(listener);
    return () => toastListeners.delete(listener);
  }, []);
  if (!items.length) return null;
  return <div className="dcr-toasts">
    {items.map((item) => <div key={item.id} className={`dcr-toast${item.kind === 'error' ? ' dcr-toast-error' : ''}`} role={item.kind === 'error' ? 'alert' : 'status'}>
      <span>{item.text}</span>
      <button type="button" aria-label={t('close')} onClick={() => removeToast(item.id)}><CloseIcon /></button>
    </div>)}
  </div>;
}

function AutoTextarea({ value, onChange, onKeyDown, label, placeholder, autoFocus }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 44), EDITOR_MAX_HEIGHT)}px`;
  }, [value]);
  useEffect(() => {
    if (!autoFocus) return;
    const element = ref.current;
    if (element) { element.focus(); element.setSelectionRange(element.value.length, element.value.length); }
  }, [autoFocus]);
  return <textarea ref={ref} rows={1} value={value} aria-label={label} placeholder={placeholder} onChange={onChange} onKeyDown={onKeyDown} spellCheck={false} />;
}

function MessageEditor({ content, facts, loadImage, renderFactorySlot, t, busy, error, warning, onCancel, onSend, model, variant = 'inline' }) {
  const textBlocks = useMemo(() => content.filter((part) => part.type === 'text'), [content]);
  const attachmentCount = content.filter((part) => part.type !== 'text').length;
  const [edits, setEdits] = useState(() => textBlocks.map((part) => part.text));
  const preview = useMemo(() => ({ ...prepareContent(content), text: '' }), [content]);
  const canSend = !busy && (edits.some((text) => text.trim()) || attachmentCount > 0);
  const send = () => {
    if (!canSend) return;
    onSend(textBlocks.length === 0 ? undefined : edits);
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); send(); }
  };
  const nativePreview = renderFactorySlot && loadImage
    ? renderFactorySlot('conversation.chat.user.content', { content: preview, loadImage, facts: facts ?? {}, interactive: false })
    : null;
  const previewChips = !nativePreview && content.some((part) => part.type !== 'text')
    ? <div className="dcr-editor-chips">{content.filter((part) => part.type !== 'text').map((part, index) => <span className="dcr-chip" key={index}>
      <span>{part.attachment?.name || t(part.type === 'image' ? 'image' : 'file')}</span>
      {part.attachment?.bytes !== undefined && <em>{part.attachment.bytes} B</em>}
    </span>)}</div>
    : null;
  return <div className={`dcr-editor${variant === 'panel' ? ' dcr-editor-panel' : ''}`} onKeyDown={onKeyDown}>
    {nativePreview ?? previewChips}
    {textBlocks.length === 0
      ? <p className="dcr-editor-note">{t('attachmentOnly')}</p>
      : edits.map((value, index) => <div className="dcr-editor-block" key={index}>
        {edits.length > 1 && <span className="dcr-editor-label">{t('part', { index: index + 1 })}</span>}
        <AutoTextarea value={value} label={edits.length > 1 ? t('part', { index: index + 1 }) : t('messageText')} autoFocus={index === 0} onChange={(event) => setEdits((previous) => previous.map((item, position) => position === index ? event.target.value : item))} onKeyDown={onKeyDown} />
      </div>)}
    {warning && <p className="dcr-editor-note dcr-editor-warning">{warning}</p>}
    {variant === 'panel' && <p className="dcr-editor-note">{t('editorNote')}</p>}
    {error && <p className="dcr-inline-error" role="alert">{errorText(t, error)}</p>}
    <div className="dcr-editor-foot">
      <span className="dcr-editor-hint">{busy ? t('working') : t('editHint', { modifier: PRIMARY_MODIFIER })}</span>
      <span className="dcr-editor-actions">
        {variant === 'panel' && <span className="dcr-model">{model ? t('modelLine', { model }) : t('noModel')}</span>}
        <button type="button" className="dcr-btn dcr-btn-ghost" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="dcr-btn dcr-btn-primary" title={t('editorNote')} disabled={!canSend} onClick={send}>{busy ? <Spinner /> : textBlocks.length === 0 ? null : <SendIcon />}{t(textBlocks.length === 0 ? 'resendOriginal' : 'sendEdited')}</button>
      </span>
    </div>
  </div>;
}

function UserMessageNode({ node, loadImage, renderFactorySlot, sessionId, remote, t }) {
  const data = node.data;
  const content = data.content;
  const prepared = useMemo(() => {
    const value = prepareContent(content);
    if (Array.isArray(data.referenceLabels) && data.referenceLabels.length) value.referenceLabels = data.referenceLabels;
    return value;
  }, [content, data.referenceLabels]);
  const facts = useMemo(() => ({
    ...(Array.isArray(data.referenceLabels) && data.referenceLabels.length ? { sessionLabels: data.referenceLabels } : {}),
    ...(Array.isArray(data.skillNames) && data.skillNames.length ? { skillNames: data.skillNames } : {}),
  }), [data.referenceLabels, data.skillNames]);
  const textBlocks = prepared.text;
  const textCount = content.filter((part) => part.type === 'text').length;
  const canEdit = textCount > 0;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [uncertain, setUncertain] = useState(null);
  const [copied, setCopied] = useState(false);
  const [impact, setImpact] = useState(null);
  const requestRef = useRef({ id: null, signature: null });
  const active = useRef(true);
  const timer = useRef(null);
  useEffect(() => { active.current = true; return () => { active.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);
  useEffect(() => {
    if (!notice) return;
    timer.current = setTimeout(() => { if (active.current) setNotice(null); }, 3200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [notice]);
  const request = (value) => callRecovery(typeof fetch === 'function' ? fetch.bind(globalThis) : null, remote, sessionId, value);
  useEffect(() => {
    if (!editing) { setImpact(null); return; }
    let alive = true;
    setImpact(null);
    void request({ action: 'inspect', seq: data.seq }).then((result) => { if (alive && active.current) setImpact(result); }, () => {});
    return () => { alive = false; };
  }, [editing, data.seq]);

  const rendered = renderFactorySlot
    ? renderFactorySlot('conversation.chat.user.content', { content: prepared, loadImage, facts, interactive: true })
    : null;
  const native = rendered ?? <div className="dcr-fallback">
    <div className="dcr-fallback-bubble">{prepared.text || t('attachmentOnly')}</div>
    {prepared.attachments.length > 0 && <div className="dcr-editor-chips">{prepared.attachments.map((part, index) => <span className="dcr-chip" key={index}><span>{part.image?.attachment?.name || part.file?.name || t('file')}</span></span>)}</div>}
  </div>;

  async function send(edits) {
    if (busy || uncertain) return;
    const signature = JSON.stringify(edits ?? null);
    const requestId = requestIdFor(requestRef, signature);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request({ action: 'resend', seq: data.seq, requestId, ...(edits === undefined ? {} : { edits }) });
      if (!active.current) return;
      if (result.state === 'accepted') {
        resetRequestId(requestRef);
        setEditing(false);
        setNotice(t('sentAgain'));
        updateUi(sessionId, { open: false, quote: '' });
      } else if (result.state === 'uncertain') {
        resetRequestId(requestRef);
        setEditing(false);
        setUncertain(result.token);
      } else {
        setError(result.error ?? 'RECOVERY_FAILED');
      }
    } catch (cause) {
      if (active.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function check() {
    if (!uncertain || busy) return;
    setBusy(true);
    try {
      const result = await request({ action: 'status', token: uncertain });
      if (!active.current) return;
      if (result.state === 'accepted') { setUncertain(null); setNotice(t('checkedSent')); }
      else setNotice(t('stillUncertain'));
    } catch (cause) {
      if (active.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function copy() {
    if (!textBlocks) return;
    try {
      await navigator.clipboard.writeText(textBlocks);
      if (active.current) { setCopied(true); setTimeout(() => { if (active.current) setCopied(false); }, 1200); }
    } catch { /* Clipboard access can be denied; the text is still selectable. */ }
  }

  if (editing) {
    return <div className="dcr-msg" data-dcr-seq={data.seq}>
      <MessageEditor content={content} facts={facts} loadImage={loadImage} renderFactorySlot={renderFactorySlot} t={t} busy={busy} error={error} warning={impact?.toolCalls > 0 ? t('toolCallsWarning', { count: impact.toolCalls }) : null} onCancel={() => { setEditing(false); setError(null); }} onSend={send} />
    </div>;
  }

  return <div className="dcr-msg" data-dcr-seq={data.seq} data-busy={busy || undefined}>
    {native}
    <div className="dcr-msg-actions">
      <span className="dcr-msg-time">{data.time ? timeText(data.time) : ''}</span>
      {canEdit && <IconButton label={t('editAndResend')} disabled={busy || Boolean(uncertain)} onClick={() => { setEditing(true); setError(null); setNotice(null); }}><EditIcon /></IconButton>}
      <IconButton label={t('resendHint')} disabled={busy || Boolean(uncertain)} busy={busy} onClick={() => void send(undefined)}><ResendIcon /></IconButton>
      {textBlocks && <IconButton label={copied ? t('copied') : t('copy')} onClick={() => void copy()}>{copied ? <CheckIcon /> : <CopyIcon />}</IconButton>}
    </div>
    {notice && <div className="dcr-msg-note"><CheckIcon />{notice}</div>}
    {error && <p className="dcr-inline-error" role="alert">{errorText(t, error)}</p>}
    {uncertain && <div className="dcr-msg-warning"><WarnIcon />{t('uncertain')}<button type="button" className="dcr-link" disabled={busy} onClick={() => void check()}>{t('checkResult')}</button></div>}
  </div>;
}

function RetryTurnAction({ messageId, sessionId, remote, t }) {
  const [busy, setBusy] = useState(false);
  const requestRef = useRef({ id: null, signature: null });
  async function retry() {
    if (busy) return;
    const requestId = requestIdFor(requestRef, messageId);
    setBusy(true);
    try {
      const request = (value) => callRecovery(typeof fetch === 'function' ? fetch.bind(globalThis) : null, remote, sessionId, value);
      const result = await request({ action: 'retry-turn', messageId, requestId });
      if (result.state === 'accepted') { resetRequestId(requestRef); pushToast('success', t('retryStarted')); }
      else if (result.state === 'uncertain') { resetRequestId(requestRef); pushToast('error', t('errors.SEND_UNCERTAIN')); }
      else pushToast('error', errorText(t, result.error ?? 'RECOVERY_FAILED'));
    } catch (cause) {
      pushToast('error', errorText(t, cause.code ?? 'RECOVERY_FAILED'));
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="dcr-native-action" aria-label={t('retryTurn')} title={t('retryTurnHint')} disabled={busy} onClick={() => void retry()}>{busy ? <Spinner /> : <RetryIcon />}</button>;
}

function ComposerTools({ sessionId, t }) {
  const [ui, setUi] = useUi(sessionId);
  const selection = useSelection();
  return <span className="dcr-tools dcr-chrome">
    {selection && <ToolButton label={t('quoteHint')} onPointerDown={(event) => event.preventDefault()} onClick={() => setUi({ open: true, quote: selection })}><QuoteIcon /></ToolButton>}
    <ToolButton label={t('historyHint')} active={ui.open} onClick={() => setUi(ui.open ? { open: false, quote: '' } : { open: true, quote: '' })}><HistoryIcon /></ToolButton>
  </span>;
}

function QuoteEditor({ quote, sessionId, remote, t, onDone, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef({ id: null, signature: null });
  const canSend = !busy && Boolean(text.trim());
  async function send() {
    if (!canSend) return;
    const requestId = requestIdFor(requestRef, text);
    setBusy(true);
    setError(null);
    try {
      await callRecovery(typeof fetch === 'function' ? fetch.bind(globalThis) : null, remote, sessionId, { action: 'reply', text, quote, requestId });
      resetRequestId(requestRef);
      onDone();
    } catch (cause) {
      setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      setBusy(false);
    }
  }
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); void send(); }
  };
  return <div className="dcr-pop-body" onKeyDown={onKeyDown}>
    <div className="dcr-editor dcr-editor-panel">
      <div className="dcr-quote">
        <div className="dcr-quote-head"><QuoteIcon />{t('quotedSelection', { count: quote.length })}</div>
        <blockquote className="dcr-quote-body">{quote}</blockquote>
      </div>
      <AutoTextarea value={text} label={t('replyPlaceholder')} placeholder={t('replyPlaceholder')} autoFocus onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} />
      {error && <p className="dcr-inline-error" role="alert">{errorText(t, error)}</p>}
      <div className="dcr-editor-foot">
        <span className="dcr-editor-hint">{busy ? t('working') : t('editHint', { modifier: PRIMARY_MODIFIER })}</span>
        <span className="dcr-editor-actions">
          <button type="button" className="dcr-btn dcr-btn-ghost" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
          <button type="button" className="dcr-btn dcr-btn-primary" disabled={!canSend} onClick={() => void send()}>{busy ? <Spinner /> : <SendIcon />}{t('replySend')}</button>
        </span>
      </div>
    </div>
  </div>;
}

function RecoveryPanel({ sessionId, t, remote }) {
  const [ui, setUi] = useUi(sessionId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const root = useRef(null);
  const active = useRef(true);
  const loadTicket = useRef(0);
  const detailTicket = useRef(0);
  const panelRequest = useRef({ id: null, signature: null });
  const retryRequest = useRef({ id: null, signature: null });
  const request = (value) => callRecovery(typeof fetch === 'function' ? fetch.bind(globalThis) : null, remote, sessionId, value);

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    loadTicket.current++;
    detailTicket.current++;
    setData(null); setView('list'); setSelected(null); setError(null); setBusy(false);
  }, [sessionId]);
  useEffect(() => {
    if (!ui.open) {
      setView('list'); setSelected(null); setError(null); setData(null);
    }
  }, [ui.open]);
  useEffect(() => {
    if (!ui.open || ui.quote) return;
    void load(false);
  }, [ui.open, ui.quote, reload]);
  useEffect(() => {
    if (!ui.open) return;
    const onPointerDown = (event) => {
      if (root.current?.contains(event.target) || event.target.closest?.('[data-dcr-trigger]')) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [ui.open, setUi]);

  async function load(more) {
    const ticket = ++loadTicket.current;
    if (!more) { setLoading(true); setError(null); }
    try {
      const previous = more ? data?.items ?? [] : [];
      const before = more && previous.length ? { before: previous.at(-1).seq } : {};
      const result = await request({ action: 'list', ...before });
      if (!active.current || ticket !== loadTicket.current) return;
      setData(more ? { ...result, items: [...previous, ...result.items] } : result);
    } catch (cause) {
      if (active.current && ticket === loadTicket.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current && ticket === loadTicket.current) setLoading(false);
    }
  }

  function close() {
    loadTicket.current++;
    detailTicket.current++;
    setUi({ open: false, quote: '' });
  }

  async function openItem(item) {
    const ticket = ++detailTicket.current;
    setView('edit');
    setSelected({ seq: item.seq, loading: true });
    setError(null);
    try {
      const result = await request({ action: 'inspect', seq: item.seq });
      if (active.current && ticket === detailTicket.current) setSelected(result);
    } catch (cause) {
      if (active.current && ticket === detailTicket.current) {
        setSelected(null); setView('list');
        pushToast('error', errorText(t, cause.code ?? 'RECOVERY_FAILED'));
      }
    }
  }

  function back() {
    detailTicket.current++;
    setView('list'); setSelected(null); setError(null);
  }

  async function resume() {
    if (!data?.pending) return;
    setBusy(true); setError(null);
    try {
      const result = await request({ action: 'load-draft', token: data.pending.token });
      if (active.current) { setSelected(result); setView('edit'); }
    } catch (cause) {
      if (active.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function retryLast() {
    if (data?.lastUserSeq === null || data?.lastUserSeq === undefined || busy) return;
    const requestId = requestIdFor(retryRequest, `seq:${data.lastUserSeq}`);
    setBusy(true);
    try {
      const result = await request({ action: 'resend', seq: data.lastUserSeq, requestId });
      if (!active.current) return;
      if (result.state === 'accepted') { resetRequestId(retryRequest); pushToast('success', t('retryStarted')); setReload((value) => value + 1); }
      else if (result.state === 'uncertain') { resetRequestId(retryRequest); setError('SEND_UNCERTAIN'); }
      else setError(result.error ?? 'RECOVERY_FAILED');
    } catch (cause) {
      if (active.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function sendFromPanel(edits) {
    if (!selected || busy) return;
    const signature = JSON.stringify(edits ?? null);
    const requestId = requestIdFor(panelRequest, signature);
    setBusy(true); setError(null);
    try {
      const result = await request({ action: 'resend', seq: selected.seq, requestId, ...(edits === undefined ? {} : { edits }) });
      if (!active.current) return;
      if (result.state === 'accepted') {
        resetRequestId(panelRequest);
        pushToast('success', t('sentAgain'));
        back();
        setReload((value) => value + 1);
      } else if (result.state === 'uncertain') {
        resetRequestId(panelRequest);
        setError('SEND_UNCERTAIN');
      } else {
        setError(result.error ?? 'RECOVERY_FAILED');
      }
    } catch (cause) {
      if (active.current) setError(cause.code ?? 'RECOVERY_FAILED');
    } finally {
      if (active.current) setBusy(false);
    }
  }

  if (!ui.open) return null;

  const title = ui.quote ? t('quoteSelection') : view === 'edit' ? t('editTitle') : t('historyTitle');
  return <div className="dcr-pop dcr-chrome" role="dialog" aria-label={title} ref={root}>
    <header className="dcr-pop-head">
      {!ui.quote && view === 'edit' && <button type="button" className="dcr-icon-btn" aria-label={t('back')} onClick={back}><BackIcon /></button>}
      <span className="dcr-pop-title">{title}</span>
      {!ui.quote && view === 'list' && <button type="button" className="dcr-icon-btn" aria-label={t('refresh')} title={t('refresh')} disabled={loading} onClick={() => void load(false)}>{loading ? <Spinner /> : <RefreshIcon />}</button>}
      <button type="button" className="dcr-icon-btn" aria-label={t('close')} title={t('close')} onClick={close}><CloseIcon /></button>
    </header>
    {ui.quote
      ? <QuoteEditor quote={ui.quote} sessionId={sessionId} remote={remote} t={t} onCancel={() => setUi({ quote: '' })} onDone={() => { setUi({ open: false, quote: '' }); pushToast('success', t('replySent')); }} />
      : view === 'list'
        ? <>
          <div className="dcr-pop-scroll">
            {error && <p className="dcr-pop-error" role="alert">{errorText(t, error)}</p>}
            {data?.archiveIssue && <p className="dcr-pop-error" role="status">{t('backupIssue', { code: data.archiveIssue })}</p>}
            {data?.lastUserSeq !== null && data?.lastUserSeq !== undefined && <button type="button" className="dcr-quick" disabled={busy || data.activity?.running} onClick={() => void retryLast()} title={data.activity?.running ? t('runningHint') : t('retryLastHint')}>
              {busy ? <Spinner /> : <RetryIcon />}<span>{t('retryLastTurn')}</span><small>{data.route?.model ?? ''}</small>
            </button>}
            {data?.pending && <div className="dcr-banner"><span>{t('pendingResume')}</span><button type="button" className="dcr-btn" disabled={busy} onClick={() => void resume()}>{t('resume')}</button></div>}
            {!data && loading && <div className="dcr-skeleton"><span /><span /><span /></div>}
            {data && data.items.length === 0 && <div className="dcr-pop-empty"><HistoryIcon /><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div>}
            {data && data.items.length > 0 && <ol className="dcr-list">{data.items.map((item) => <li key={item.seq}>
              <button type="button" className="dcr-row" onClick={() => void openItem(item)}>
                <span className="dcr-row-main">
                  <span className="dcr-row-text">{item.preview || t('attachmentOnly')}</span>
                  <span className="dcr-row-meta"><time>{whenText(item.time)}</time><span>#{item.seq}</span>{item.toolCalls > 0 && <span className="dcr-row-warn">{t('toolChip', { count: item.toolCalls })}</span>}{item.attachments.map((part, index) => <i key={index}>{part.name || t(part.type === 'image' ? 'image' : 'file')}</i>)}</span>
                </span>
                <span className="dcr-row-chevron"><ChevronIcon /></span>
              </button>
            </li>)}</ol>}
            {data?.hasMore && <div className="dcr-pop-body"><button type="button" className="dcr-link" disabled={loading} onClick={() => void load(true)}>{loading ? t('loading') : t('more')}</button></div>}
          </div>
          <footer className="dcr-pop-foot"><span>{data?.activity?.running ? t('runningHint') : t('historyHint')}</span></footer>
        </>
        : <div className="dcr-pop-body">
          {selected?.loading ? <div className="dcr-skeleton"><span /><span /><span /></div>
            : selected ? <MessageEditor key={selected.seq} content={selected.content ?? selected.originalContent ?? []} facts={{}} t={t} busy={busy} error={error} warning={selected.toolCalls > 0 ? t('toolCallsWarning', { count: selected.toolCalls }) : null} model={selected.route?.model ?? data?.route?.model} variant="panel" onCancel={back} onSend={sendFromPanel} />
              : <div className="dcr-pop-empty"><strong>{t('empty')}</strong></div>}
        </div>}
  </div>;
}

function ensureStyles() {
  if (typeof document === 'undefined') return;
  let element = document.querySelector('style[data-dcr-styles]');
  if (!element) {
    element = document.createElement('style');
    element.dataset.dcrStyles = '';
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}

export function apply(ctx) {
  ensureStyles();
  ctx.effect(() => ctx.locale.register(NS, translations));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'user', locale: NS },
    (props) => <UserMessageNode {...props} remote={ctx.remote} />,
  ));
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
    { name: 'conversation.chat.assistant-actions', id: 'content-rollback.retry', order: 10, locale: NS },
    (props) => <RetryTurnAction {...props} remote={ctx.remote} />,
  ));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
    { name: 'conversation.input.left', id: 'content-rollback.history', order: 10, locale: NS },
    (props) => <ComposerTools {...props} />,
  ));
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register(
    { name: 'conversation.input.overlay', id: 'content-rollback.panel', order: 10, locale: NS },
    (props) => <RecoveryPanel {...props} remote={ctx.remote} />,
  ));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'content-rollback.toasts', order: 100, locale: NS },
    (props) => <ToastHost {...props} />,
  ));
}
