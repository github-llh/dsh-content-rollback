window.__ModuleLoader__.load({id:'dsh-content-rollback',factory(require){const module={exports:{}};const exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);

// src/client/transport.js
async function callRecovery(remote, sessionId, request, signal) {
  if (!remote?.commands?.execute) throw Object.assign(new Error("UNAVAILABLE"), { code: "UNAVAILABLE" });
  const response = await remote.commands.execute(sessionId, `/rollback ${JSON.stringify(request)}`, [], signal);
  if (!response?.ok) throw Object.assign(new Error(response?.error?.message ?? "DISCONNECTED"), { code: "DISCONNECTED" });
  const result = response.value?.result;
  if (!result || result.kind !== "success") throw Object.assign(new Error(result?.text ?? "UNAVAILABLE"), { code: "UNAVAILABLE" });
  const envelope = JSON.parse(result.text);
  if (!envelope.ok) throw Object.assign(new Error(envelope.error.message), { code: envelope.error.code });
  return envelope.value;
}
var DraftWriter = class {
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
    try {
      this.storage.setItem(`dsh-rollback:${this.token}`, JSON.stringify({ revision: this.revision, edits: this.latest }));
    } catch {
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), this.delay);
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
  commit() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.waiters.length) return;
    const value = this.latest;
    const waiters = this.waiters.splice(0);
    const next = this.pending.catch(() => {
    }).then(async () => {
      const result = await this.send({ action: "save-draft", token: this.token, revision: this.revision, edits: value });
      this.revision = result.revision;
      this.error = null;
      try {
        const current = JSON.parse(this.storage.getItem(`dsh-rollback:${this.token}`) ?? "null");
        if (JSON.stringify(current?.edits) === JSON.stringify(value)) this.storage.removeItem(`dsh-rollback:${this.token}`);
      } catch {
      }
      return result;
    });
    this.pending = next;
    void next.then((result) => {
      for (const waiter of waiters) waiter.resolve(result);
    }, (error) => {
      this.error = error;
      for (const waiter of waiters) waiter.reject(error);
    });
  }
  async flush() {
    this.commit();
    await this.pending;
    if (this.error) throw this.error;
  }
};

// src/client/locale.js
var translations = {
  zh: {
    title: "\u5BF9\u8BDD\u56DE\u6EAF",
    tagline: "\u539F\u6587 \xB7 \u9644\u4EF6 \xB7 \u5F53\u524D\u4F1A\u8BDD",
    close: "\u6536\u8D77",
    refresh: "\u5237\u65B0",
    loading: "\u6B63\u5728\u8BFB\u53D6\u2026",
    empty: "\u8FD8\u6CA1\u6709\u5DF2\u53D1\u9001\u7684\u7528\u6237\u6D88\u606F\u3002",
    history: "\u9009\u62E9\u8981\u627E\u56DE\u7684\u6D88\u606F",
    more: "\u52A0\u8F7D\u66F4\u65E9\u6D88\u606F",
    attachmentOnly: "\u4EC5\u9644\u4EF6\u6D88\u606F",
    back: "\u8FD4\u56DE\u6D88\u606F\u5217\u8868",
    retry: "\u539F\u6837\u91CD\u53D1",
    edit: "\u53D6\u56DE\u7F16\u8F91",
    send: "\u5728\u5F53\u524D\u4F1A\u8BDD\u53D1\u9001",
    working: "\u5904\u7406\u4E2D\u2026",
    original: "\u539F\u59CB\u53D1\u9001\u5185\u5BB9",
    saved: "\u5DF2\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D\u2026",
    saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u4E0D\u8981\u5173\u95ED\u6B64\u9875",
    image: "\u56FE\u7247",
    file: "\u9644\u4EF6",
    part: "\u6587\u5B57\u7247\u6BB5 {index}",
    model: "\u53D1\u9001\u6A21\u578B",
    noModel: "\u672A\u9009\u62E9\u6A21\u578B",
    scope: "\u53EA\u4F1A\u5728\u5F53\u524D\u4F1A\u8BDD\u5185\u91CD\u53D1\u3002\u4E0D\u65B0\u5EFA\u3001\u4E0D\u5207\u6362\u4F1A\u8BDD\uFF1B\u65E7\u6D88\u606F\u4E0E\u56DE\u590D\u4FDD\u7559\u5728\u539F\u5904\uFF0C\u4E0D\u4F1A\u64A4\u9500\u5DE5\u5177\u5BF9\u6587\u4EF6\u6216\u5916\u90E8\u7CFB\u7EDF\u7684\u4FEE\u6539\u3002",
    tools: "\u8BE5\u6D88\u606F\u4E4B\u540E\u5171\u6709 {count} \u6B21\u5DE5\u5177\u8C03\u7528\u3002\u91CD\u53D1\u4E0D\u4F1A\u64A4\u9500\u5B83\u4EEC\uFF0C\u53EF\u80FD\u518D\u6B21\u6267\u884C\uFF0C\u8BF7\u5148\u6838\u5BF9\u5916\u90E8\u72B6\u6001\u3002",
    media: "\u9644\u4EF6\u4FDD\u6301\u987A\u5E8F\u548C\u5DF2\u53D1\u9001\u7248\u672C\uFF1B\u56FE\u7247\u53EF\u80FD\u5DF2\u7531 dsh \u538B\u7F29\uFF0C\u89C6\u9891\u6309\u6587\u4EF6\u4FDD\u7559\uFF0C\u4E0D\u627F\u8BFA\u6A21\u578B\u80FD\u89E3\u6790\u3002",
    paths: "\u68C0\u6D4B\u5230\u8DEF\u5F84\u5F15\u7528\uFF1A\u4EC5\u4FDD\u7559\u5F15\u7528\u6587\u5B57\uFF0C\u539F\u8DEF\u5F84\u6587\u4EF6\u53EF\u80FD\u5DF2\u6539\u53D8\uFF0C\u4E0D\u80FD\u4FDD\u8BC1\u6062\u590D\u539F\u6587\u4EF6\u3002",
    stop: "\u5982\u4ECD\u5728\u751F\u6210\uFF0C\u5148\u505C\u6B62\u5F53\u524D\u4F1A\u8BDD\u518D\u53D1\u9001\uFF08\u4E0D\u4F1A\u6E05\u7A7A\u6392\u961F\u6D88\u606F\uFF09",
    accepted: "\u5DF2\u5728\u5F53\u524D\u4F1A\u8BDD\u63D0\u4EA4\uFF0C\u751F\u6210\u8FC7\u7A0B\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u67E5\u770B\u3002",
    uncertain: "\u4E0A\u6B21\u53D1\u9001\u7ED3\u679C\u5C1A\u4E0D\u786E\u5B9A\u3002\u4E3A\u907F\u514D\u91CD\u590D\u53D1\u9001\uFF0C\u5DF2\u963B\u6B62\u81EA\u52A8\u91CD\u53D1\uFF1B\u8BF7\u5237\u65B0\u6838\u5BF9\u540E\u518D\u51B3\u5B9A\u3002",
    resume: "\u7EE7\u7EED\u4E0A\u6B21\u56DE\u6EAF",
    check: "\u6838\u5BF9\u53D1\u9001\u7ED3\u679C",
    preserveDraft: "\u8FD9\u91CC\u7F16\u8F91\u4E0D\u4F1A\u8986\u76D6 dsh \u8F93\u5165\u6846\u4E2D\u5DF2\u6709\u7684\u8349\u7A3F\uFF1B\u9644\u4EF6\u4E0D\u53EF\u88AB\u610F\u5916\u79FB\u9664\u3002",
    conflict: "\u672C\u673A\u672A\u4FDD\u5B58\u5185\u5BB9\u4E0E\u53E6\u4E00\u9875\u9762\u7684\u8349\u7A3F\u51B2\u7A81\u3002\u4E0B\u65B9\u662F\u672C\u673A\u7248\u672C\uFF0C\u8BF7\u9009\u62E9\u4FDD\u7559\u54EA\u4E00\u4EFD\u3002",
    useLocal: "\u4F7F\u7528\u672C\u673A\u7248\u672C",
    useSaved: "\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7248\u672C",
    reloadDraft: "\u91CD\u65B0\u8F7D\u5165\u5E76\u6BD4\u8F83",
    restore: "\u8FD8\u539F\u539F\u6587",
    retrySave: "\u91CD\u65B0\u4FDD\u5B58",
    backupIssue: "\u540E\u53F0\u5907\u4EFD\u672A\u5B8C\u6210\uFF1A{code}\u3002\u53D1\u9001\u524D\u5C06\u91CD\u65B0\u6821\u9A8C\u3002",
    error: "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF1A{code}\u3002\u539F\u4F1A\u8BDD\u5185\u5BB9\u672A\u88AB\u5220\u9664\u3002",
    "errors.UNAVAILABLE": "\u63D2\u4EF6\u6216\u547D\u4EE4\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F dsh\u3002",
    "errors.DISCONNECTED": "\u8FDE\u63A5\u4E2D\u65AD\u3002\u8BF7\u91CD\u8FDE\u540E\u6838\u5BF9\u53D1\u9001\u7ED3\u679C\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002",
    "errors.MESSAGE_NOT_FOUND": "\u6D88\u606F\u4E0D\u5B58\u5728\u6216\u4E0D\u662F\u7528\u6237\u53D1\u9001\u7684\u6D88\u606F\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u3002",
    "errors.UNSUPPORTED_CONTENT": "\u6D88\u606F\u5305\u542B\u5F53\u524D\u63D2\u4EF6\u672A\u8BC6\u522B\u7684\u5185\u5BB9\uFF0C\u5DF2\u963B\u6B62\u6709\u635F\u91CD\u53D1\u3002",
    "errors.SESSION_RUNNING": "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u5728\u751F\u6210\u3002\u53EF\u52FE\u9009\u5148\u505C\u6B62\uFF0C\u6216\u4F7F\u7528 dsh \u505C\u6B62\u6309\u94AE\u540E\u91CD\u8BD5\u3002",
    "errors.PENDING_QUEUE": "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6709\u6392\u961F\u6D88\u606F\uFF0C\u8BF7\u5148\u5904\u7406\u961F\u5217\uFF0C\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u4E22\u5F03\u5B83\u4EEC\u3002",
    "errors.STOP_TIMEOUT": "\u505C\u6B62\u5C1A\u672A\u5B8C\u6210\uFF1B\u8BF7\u7B49\u5F85 dsh \u771F\u6B63\u505C\u6B62\u540E\u91CD\u8BD5\u3002",
    "errors.MODEL_CHANGED": "\u53D1\u9001\u6A21\u578B\u4E0E\u9875\u9762\u663E\u793A\u7684\u4E0D\u4E00\u81F4\uFF0C\u5C1A\u672A\u53D1\u9001\u3002\u8BF7\u5728\u5F53\u524D\u4F1A\u8BDD\u9009\u597D\u6A21\u578B\u540E\u5237\u65B0\u518D\u53D1\u9001\u3002",
    "errors.MODEL_NO_IMAGES": "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\uFF1B\u5185\u5BB9\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u9009\u62E9\u652F\u6301\u56FE\u7247\u7684\u6A21\u578B\u3002",
    "errors.OPEN_EDITOR_FIRST": "\u8BF7\u5148\u201C\u53D6\u56DE\u7F16\u8F91\u201D\uFF0C\u518D\u53D1\u9001\u4FEE\u6539\u540E\u7684\u5185\u5BB9\u3002",
    "errors.DRAFT_CONFLICT": "\u8349\u7A3F\u5DF2\u5728\u53E6\u4E00\u9875\u9762\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u5E76\u6838\u5BF9\u5185\u5BB9\u3002",
    "errors.EMPTY_MESSAGE": "\u4E0D\u80FD\u53D1\u9001\u6CA1\u6709\u6587\u5B57\u548C\u9644\u4EF6\u7684\u7A7A\u6D88\u606F\u3002",
    "errors.FORBIDDEN": "\u5F53\u524D\u4F1A\u8BDD\u65E0\u6743\u8BBF\u95EE\u8FD9\u6B21\u56DE\u6EAF\u3002",
    "errors.RECOVERY_LOCKED": "\u540C\u4E00\u4F1A\u8BDD\u5B58\u5728\u8FD0\u884C\u4E2D\u6216\u4E2D\u65AD\u7684\u64CD\u4F5C\u9501\uFF1B\u8BF7\u6838\u5BF9\u4E0A\u6B21\u7ED3\u679C\uFF0C\u4E0D\u8981\u91CD\u590D\u6267\u884C\u3002",
    "errors.NO_PERSISTENCE": "\u5BBF\u4E3B\u672A\u786E\u8BA4\u5386\u53F2\u5DF2\u843D\u76D8\uFF0C\u53D1\u9001\u5DF2\u6682\u505C\uFF0C\u539F\u5185\u5BB9\u5907\u4EFD\u4FDD\u7559\u3002",
    "errors.SOURCE_CHANGED": "\u8BE5\u6D88\u606F\u5DF2\u88AB\u4FEE\u6539\u6216\u5220\u9664\uFF0C\u8BF7\u5237\u65B0\u5E76\u91CD\u65B0\u9009\u62E9\u3002",
    "errors.SESSION_CHANGED": "\u4F1A\u8BDD\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5E76\u6838\u5BF9\u3002",
    "errors.SESSION_NOT_ACTIVE": "\u4F1A\u8BDD\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u5728 dsh \u4E2D\u6253\u5F00\u540E\u91CD\u8BD5\u3002",
    "errors.BACKUP_INVALID": "\u5907\u4EFD\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u963B\u6B62\u91CD\u53D1\uFF0C\u8BF7\u4FDD\u7559\u539F\u4F1A\u8BDD\u5E76\u68C0\u67E5\u5B58\u50A8\u3002"
  },
  en: {
    title: "Conversation recovery",
    tagline: "Text \xB7 Attachments \xB7 This session",
    close: "Collapse",
    refresh: "Refresh",
    loading: "Loading\u2026",
    empty: "No sent user messages yet.",
    history: "Choose a message",
    more: "Load earlier messages",
    attachmentOnly: "Attachments only",
    back: "Message history",
    retry: "Retry unchanged",
    edit: "Retrieve for editing",
    send: "Send in this conversation",
    working: "Working\u2026",
    original: "Original sent content",
    saved: "Saved",
    saving: "Saving\u2026",
    saveFailed: "Save failed. Retry before closing this page.",
    image: "Image",
    file: "File",
    part: "Text block {index}",
    model: "Sending model",
    noModel: "No model selected",
    scope: "Resending happens only in this conversation. No session is created or switched; earlier messages and replies stay where they are, and tool side effects on files or external systems are not reverted.",
    tools: "This message is followed by {count} tool calls. Resending does not undo them and may run them again; verify external state first.",
    media: "Attachment order and sent versions are preserved. DSH may have compressed images. Videos remain files; model support is not guaranteed.",
    paths: "Path references detected: only reference text is preserved. Files at those paths may have changed.",
    stop: "Stop the current conversation first if it is running (queued input is never discarded)",
    accepted: "Submitted in this conversation. Generation progress appears here.",
    uncertain: "The previous send outcome is uncertain. Automatic resending is blocked to avoid duplicates; refresh and verify.",
    resume: "Resume recovery",
    check: "Check send result",
    preserveDraft: "Editing here never overwrites the DSH composer draft. Attachments cannot be accidentally removed.",
    conflict: "Unsaved local text conflicts with a draft from another page. Your local version is shown below. Choose which version to keep.",
    useLocal: "Use local version",
    useSaved: "Keep saved version",
    reloadDraft: "Reload and compare",
    restore: "Restore original text",
    retrySave: "Save again",
    backupIssue: "Background backup is incomplete: {code}. It will be verified before sending.",
    error: "Recovery did not finish: {code}. The original conversation content was not deleted.",
    "errors.UNAVAILABLE": "The plugin or command service is unavailable. Check installation and restart DSH.",
    "errors.DISCONNECTED": "Disconnected. Reconnect and check the send result before resubmitting.",
    "errors.MESSAGE_NOT_FOUND": "This message is unavailable or was not sent by a user. Refresh history.",
    "errors.UNSUPPORTED_CONTENT": "Unknown content detected. Lossy replay has been blocked.",
    "errors.SESSION_RUNNING": "This conversation is running. Enable stop-first or stop it in DSH before retrying.",
    "errors.PENDING_QUEUE": "Queued input exists in this conversation. Handle the queue first; the plugin never discards it.",
    "errors.STOP_TIMEOUT": "Stopping is not yet complete. Wait for DSH to become idle and retry.",
    "errors.MODEL_CHANGED": "The sending model differs from the one shown. Nothing was sent. Choose a model in this conversation, refresh, then send.",
    "errors.MODEL_NO_IMAGES": "This model does not accept images. Your content is preserved; choose an image-capable model.",
    "errors.OPEN_EDITOR_FIRST": "Retrieve the message for editing before sending modified text.",
    "errors.DRAFT_CONFLICT": "Another page updated this draft. Reload and compare before continuing.",
    "errors.EMPTY_MESSAGE": "A message needs text or an attachment.",
    "errors.FORBIDDEN": "This conversation cannot access that recovery.",
    "errors.RECOVERY_LOCKED": "Another running or interrupted operation holds this conversation lock. Check its outcome before proceeding.",
    "errors.NO_PERSISTENCE": "The host has not confirmed durable history. Sending paused; the backup remains.",
    "errors.SOURCE_CHANGED": "That message was modified or removed. Refresh and select it again.",
    "errors.SESSION_CHANGED": "The conversation state changed. Refresh and check it.",
    "errors.SESSION_NOT_ACTIVE": "Open this conversation in DSH before retrying.",
    "errors.BACKUP_INVALID": "Backup integrity failed. Replay was blocked; preserve the original conversation and inspect storage."
  }
};

// src/client/styles.js
var css = `
.dcr{color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;min-width:0;width:100%;box-sizing:border-box}
.dcr *{box-sizing:border-box}.dcr button,.dcr textarea{font:inherit;color:inherit}
.dcr button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;padding:5px 9px;cursor:pointer;min-height:30px}
.dcr button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dcr button:disabled{opacity:.45;cursor:default}
.dcr button:focus-visible,.dcr textarea:focus-visible,.dcr input:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:2px}
.dcr-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 2px}.dcr-bar button{border:0}.dcr-muted{color:var(--dsw-alias-label-secondary)}.dcr-tagline{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dcr-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);margin:3px 0 8px;overflow:hidden}
.dcr-head,.dcr-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;flex-wrap:wrap}.dcr-head{border-bottom:1px solid var(--dsw-alias-border-l1)}.dcr-head h3{font-size:12px;margin:0;font-weight:600}
.dcr-scroll{max-height:min(48vh,420px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.dcr-list{list-style:none;margin:0;padding:4px}.dcr-list li{margin:3px 0}.dcr-list button{display:block;width:100%;text-align:left;border-color:transparent;padding:8px 9px}
.dcr-preview{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.dcr-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:4px}
.dcr-body{padding:10px 12px}.dcr-note{color:var(--dsw-alias-label-secondary);margin:0 0 9px;font-size:11px;overflow-wrap:anywhere}.dcr-error{color:var(--dsw-alias-state-error-primary);padding:8px 12px;overflow-wrap:anywhere}.dcr-warning{border-left:2px solid var(--dsw-alias-border-l1);padding-left:9px}
.dcr-block{display:block;margin:8px 0}.dcr-block-label{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:3px}.dcr textarea{display:block;width:100%;min-height:74px;max-height:240px;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:5px 8px;margin:3px 4px 3px 0;max-width:100%;overflow-wrap:anywhere}.dcr-chip span{min-width:0}
.dcr-actions{display:flex;gap:7px;flex-wrap:wrap}.dcr-primary{font-weight:600}.dcr-foot{border-top:1px solid var(--dsw-alias-border-l1)}.dcr-check{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--dsw-alias-label-secondary);margin:10px 0}.dcr-check input{margin-top:3px;accent-color:var(--dsw-alias-label-primary)}.dcr-empty{text-align:center;padding:24px 12px;color:var(--dsw-alias-label-secondary)}.dcr-status{padding:12px;overflow-wrap:anywhere}.dcr-status p{margin:0 0 8px}
@media(max-width:480px){.dcr-tagline{display:none}.dcr-head,.dcr-foot,.dcr-body{padding:9px}.dcr-foot .dcr-actions{width:100%}.dcr-foot button{flex:1}.dcr-scroll{max-height:42vh}}
@media(prefers-reduced-motion:reduce){.dcr *{scroll-behavior:auto}}
`;

// src/client/index.jsx
var NS = "dsh-content-rollback";
var inject = ["slots", "locale", "remote"];
function RecoveryIcon() {
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M5 8h10a6 6 0 0 1 0 12H9M5 8l4-4M5 8l4 4", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
}
function Panel({ sessionId, remote, t }) {
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [listing, setListing] = (0, import_react.useState)(null);
  const [selected, setSelected] = (0, import_react.useState)(null);
  const [content, setContent] = (0, import_react.useState)([]);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [saveState, setSaveState] = (0, import_react.useState)("saved");
  const [stop, setStop] = (0, import_react.useState)(false);
  const [conflict, setConflict] = (0, import_react.useState)(null);
  const active = (0, import_react.useRef)(true);
  const inFlight = (0, import_react.useRef)(false);
  const writer = (0, import_react.useRef)(null);
  const trigger = (0, import_react.useRef)(null);
  const saveGeneration = (0, import_react.useRef)(0);
  const request = (value) => callRecovery(remote, sessionId, value);
  const report = (cause) => {
    if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
  };
  const textError = (code) => translations.en[`errors.${code}`] ? t(`errors.${code}`) : t("error", { code });
  (0, import_react.useEffect)(() => {
    active.current = true;
    return () => {
      active.current = false;
      void writer.current?.flush().catch(() => {
      });
    };
  }, []);
  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (cause) {
      report(cause);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function refresh(more = false) {
    const result = await request({ action: "list", ...more && listing?.items.length ? { before: listing.items.at(-1).seq } : {} });
    if (active.current) setListing(more ? { ...result, items: [...listing.items, ...result.items] } : result);
    return result;
  }
  (0, import_react.useEffect)(() => {
    void run(() => refresh());
  }, []);
  function applyDraft(result) {
    const storage = { getItem: (key) => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: (key) => window.localStorage.removeItem(key) };
    const draftWriter = new DraftWriter(result.token, result.revision ?? 0, request, storage);
    writer.current = draftWriter;
    setConflict(null);
    let next = result.content;
    setSaveState("saved");
    try {
      const local = JSON.parse(storage.getItem(`dsh-rollback:${result.token}`) ?? "null");
      if (Array.isArray(local?.edits) && local.edits.every((item) => typeof item === "string") && local.edits.length === next.filter((part) => part.type === "text").length && ["prepared", "ready"].includes(result.state)) {
        let index = 0;
        const recovered = next.map((part) => part.type === "text" ? { ...part, text: local.edits[index++] } : part);
        if (local.revision !== result.revision && JSON.stringify(recovered) !== JSON.stringify(next)) {
          setConflict(recovered);
          setSaveState("saveFailed");
        } else {
          next = recovered;
          persist(next, draftWriter);
        }
      }
    } catch {
    }
    setSelected({ ...result, originalContent: result.originalContent ?? result.content });
    if (result.error) setError(result.error);
    setContent(next);
    setStop(false);
    setExpanded(true);
  }
  async function choose(seq) {
    await writer.current?.flush();
    const result = await request({ action: "prepare", seq });
    if (active.current) applyDraft(result);
  }
  async function resume(token) {
    await writer.current?.flush();
    const result = await request({ action: "load-draft", token });
    if (active.current) applyDraft(result);
  }
  function persist(next, target = writer.current) {
    const generation = ++saveGeneration.current;
    setSaveState("saving");
    void target.save(next.filter((part) => part.type === "text").map((part) => part.text)).then(() => {
      if (active.current && generation === saveGeneration.current) setSaveState("saved");
    }, (cause) => {
      if (active.current && generation === saveGeneration.current) {
        setSaveState("saveFailed");
        report(cause);
      }
    });
  }
  function edit(index, text) {
    const next = content.map((part, i) => i === index ? { ...part, text } : part);
    setContent(next);
    persist(next);
  }
  async function execute(mode) {
    await writer.current?.flush();
    const route = listing?.route;
    const result = await request({ action: "execute", token: selected.token, mode, stop, route, ...mode === "send" ? { revision: writer.current?.revision ?? 0 } : {} });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) setError(result.error);
    await refresh();
  }
  async function check() {
    const result = await request({ action: "status", token: selected.token });
    if (active.current) setSelected((previous) => ({ ...previous, ...result }));
  }
  const finished = selected && ["accepted", "sending", "uncertain"].includes(selected.state);
  const canEdit = selected?.state === "ready";
  const close = () => {
    setExpanded(false);
    trigger.current?.focus();
  };
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dcr", "aria-label": t("title"), onKeyDown: (event) => {
    if (event.key === "Escape" && expanded && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      close();
    }
  } }, /* @__PURE__ */ import_react.default.createElement("style", null, css), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-bar" }, /* @__PURE__ */ import_react.default.createElement("button", { ref: trigger, type: "button", "aria-expanded": expanded, onClick: () => {
    setExpanded(!expanded);
    if (!expanded) void run(() => refresh());
  } }, /* @__PURE__ */ import_react.default.createElement(RecoveryIcon, null), t("title")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-tagline" }, t("tagline")), !expanded && listing?.pending && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => resume(listing.pending.token)) }, t("resume"))), expanded && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-panel", "aria-busy": busy }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dcr-head" }, /* @__PURE__ */ import_react.default.createElement("h3", null, t(selected ? "original" : "history")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, selected && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy || saveState === "saving", onClick: () => void run(async () => {
    await writer.current?.flush();
    setSelected(null);
    await refresh();
  }) }, t("back")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => refresh()) }, t("refresh")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: close, "aria-label": t("close") }, "\xD7"))), error && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-error", role: "alert" }, textError(error), error === "DRAFT_CONFLICT" && selected && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => void run(async () => {
    const result = await request({ action: "load-draft", token: selected.token });
    if (active.current) applyDraft(result);
  }) }, t("reloadDraft"))), listing?.archiveIssue && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-error", role: "status" }, t("backupIssue", { code: listing.archiveIssue })), !selected ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-scroll" }, listing?.pending && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-body" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => resume(listing.pending.token)) }, t("resume"))), !listing ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-empty" }, t("loading")) : listing.items.length === 0 ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-empty" }, t("empty")) : /* @__PURE__ */ import_react.default.createElement("ol", { className: "dcr-list" }, listing.items.map((item) => /* @__PURE__ */ import_react.default.createElement("li", { key: item.seq }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => choose(item.seq)) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-preview" }, item.preview || t("attachmentOnly")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-meta" }, /* @__PURE__ */ import_react.default.createElement("time", null, new Date(item.time).toLocaleString()), /* @__PURE__ */ import_react.default.createElement("span", null, "#", item.seq), item.attachments.map((part, i) => /* @__PURE__ */ import_react.default.createElement("span", { key: i }, part.name || t(part.type === "image" ? "image" : "file")))))))), listing?.hasMore && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-body" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => refresh(true)) }, t("more")))) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-scroll" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-body" }, /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("scope")), selected.toolCalls > 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note dcr-warning" }, t("tools", { count: selected.toolCalls })), content.some((part) => part.type !== "text") && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("media")), selected.hasPathReferences && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note dcr-warning" }, t("paths")), conflict && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-warning" }, /* @__PURE__ */ import_react.default.createElement("p", null, t("conflict")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dcr-preview" }, conflict.filter((part) => part.type === "text").map((part) => part.text).join("\n")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
    setContent(conflict);
    persist(conflict);
    setConflict(null);
  } }, t("useLocal")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
    try {
      window.localStorage.removeItem(`dsh-rollback:${selected.token}`);
    } catch {
    }
    setConflict(null);
    setSaveState("saved");
  } }, t("useSaved")))), content.map((part, index) => part.type === "text" ? /* @__PURE__ */ import_react.default.createElement("label", { className: "dcr-block", key: index }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-block-label" }, t("part", { index: index + 1 })), /* @__PURE__ */ import_react.default.createElement("textarea", { value: part.text, readOnly: !canEdit || busy || Boolean(conflict), onChange: (event) => edit(index, event.target.value), spellCheck: false })) : /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-chip", key: index }, /* @__PURE__ */ import_react.default.createElement("span", null, t(part.type === "image" ? "image" : "file"), " \xB7 ", part.attachment?.name || part.attachment?.attachmentId), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-muted" }, part.attachment?.bytes ?? 0, " B"))), /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("preserveDraft")), canEdit && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("span", { role: "status", "aria-live": "polite" }, t(saveState)), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy || Boolean(conflict), onClick: () => {
    const next = structuredClone(selected.originalContent);
    setContent(next);
    persist(next);
  } }, t("restore")), saveState === "saveFailed" && !conflict && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => persist(content) }, t("retrySave"))), !finished && /* @__PURE__ */ import_react.default.createElement("label", { className: "dcr-check" }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: stop, onChange: (event) => setStop(event.target.checked) }), t("stop"))), finished && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-status", role: "status" }, /* @__PURE__ */ import_react.default.createElement("p", null, t(selected.state === "accepted" ? "accepted" : "uncertain")), selected.state !== "accepted" && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(check) }, t("check"))))), !finished && /* @__PURE__ */ import_react.default.createElement("footer", { className: "dcr-foot" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-muted" }, t("model"), " \xB7 ", listing?.route?.model ?? t("noModel")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, selected.state === "prepared" && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", disabled: busy, onClick: () => void run(() => execute("retry")) }, t(busy ? "working" : "retry")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => execute("edit")) }, t(busy ? "working" : "edit"))), canEdit && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", disabled: busy || saveState !== "saved", onClick: () => void run(() => execute("send")) }, t(busy ? "working" : "send")))))));
}
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, translations));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: NS,
    order: 20,
    locale: NS
  }, (props) => props.sessionId ? /* @__PURE__ */ import_react.default.createElement(Panel, { key: props.sessionId, sessionId: props.sessionId, remote: ctx.remote, t: props.t }) : null));
}

return module.exports;}});
