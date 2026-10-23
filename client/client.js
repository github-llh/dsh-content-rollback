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
var BASE = "/content-rollback";
var nonce = null;
var noncePromise = null;
function failure(code, message) {
  return Object.assign(new Error(message || code), { code });
}
async function getNonce(fetchImpl) {
  if (nonce) return nonce;
  if (!noncePromise) {
    noncePromise = fetchImpl(`${BASE}/nonce`, { credentials: "same-origin", headers: { accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw Object.assign(new Error("http-unavailable"), { fallback: true });
      const value = await response.json();
      if (!value || typeof value.nonce !== "string") throw Object.assign(new Error("http-unavailable"), { fallback: true });
      nonce = value.nonce;
      return nonce;
    }).catch((error) => {
      noncePromise = null;
      throw error;
    });
  }
  return noncePromise;
}
async function httpCall(fetchImpl, sessionId, request, signal) {
  const send = async () => {
    const token = await getNonce(fetchImpl);
    try {
      return await fetchImpl(`${BASE}/call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-dcr-nonce": token },
        body: JSON.stringify({ sessionId, request }),
        signal
      });
    } catch (error) {
      throw Object.assign(new Error(error?.message || "http-unavailable"), { fallback: true });
    }
  };
  let response = await send();
  if (response.status === 403) {
    nonce = null;
    noncePromise = null;
    response = await send();
    if (response.status === 403) throw failure("FORBIDDEN", "recovery request was rejected");
  }
  if (response.status === 404 || response.status === 405) throw Object.assign(new Error("http-unavailable"), { fallback: true });
  if (!response.ok) throw failure("DISCONNECTED", `recovery request failed with ${response.status}`);
  const envelope = await response.json();
  if (!envelope || typeof envelope.ok !== "boolean") throw failure("RECOVERY_FAILED", "invalid recovery response");
  if (!envelope.ok) throw failure(envelope.error?.code ?? "RECOVERY_FAILED", envelope.error?.message);
  return envelope.value;
}
async function commandCall(remote, sessionId, request, signal) {
  if (!remote?.commands?.execute) throw failure("UNAVAILABLE");
  const response = await remote.commands.execute(sessionId, `/rollback ${JSON.stringify(request)}`, [], signal);
  if (!response?.ok) throw failure("DISCONNECTED", response?.error?.message);
  const result = response.value?.result;
  if (!result || result.kind !== "success") throw failure("UNAVAILABLE", result?.text);
  const envelope = JSON.parse(result.text);
  if (!envelope.ok) throw failure(envelope.error?.code ?? "RECOVERY_FAILED", envelope.error?.message);
  return envelope.value;
}
async function callRecovery(fetchImpl, remote, sessionId, request, signal) {
  if (fetchImpl) {
    try {
      return await httpCall(fetchImpl, sessionId, request, signal);
    } catch (error) {
      if (!error?.fallback) throw error;
    }
  }
  return commandCall(remote, sessionId, request, signal);
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
    you: "\u4F60",
    editTitle: "\u7F16\u8F91\u6D88\u606F",
    recoveredTitle: "\u627E\u56DE\u7684\u6D88\u606F",
    emptyHint: "\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\uFF0C\u5C31\u80FD\u5728\u8FD9\u91CC\u627E\u56DE\u5B83\u7684\u539F\u6587\u4E0E\u9644\u4EF6\u3002",
    pendingResume: "\u4E0A\u6B21\u56DE\u6EAF\u5C1A\u672A\u5B8C\u6210",
    editAction: "\u7F16\u8F91\u540E\u91CD\u53D1",
    continueEdit: "\u7EE7\u7EED\u7F16\u8F91",
    finishEdit: "\u5B8C\u6210\u7F16\u8F91",
    sendEdited: "\u53D1\u9001\u4FEE\u6539",
    retryOriginal: "\u539F\u6837\u91CD\u53D1",
    retryHint: "\u53D1\u9001\u539F\u59CB\u5185\u5BB9\uFF0C\u5FFD\u7565\u5F53\u524D\u4FEE\u6539",
    impact: "\u5F71\u54CD\u4E0E\u9650\u5236",
    toolChip: "\u542B {count} \u6B21\u5DE5\u5177\u8C03\u7528",
    stopFirst: "\u5148\u505C\u6B62\u5F53\u524D\u751F\u6210",
    stopHint: "\u4E0D\u4F1A\u6E05\u7A7A\u6392\u961F\u6D88\u606F",
    queueChip: "\u6709 {count} \u6761\u6392\u961F\u6D88\u606F\uFF0C\u53D1\u9001\u524D\u8BF7\u5148\u5904\u7406",
    editHint: "{modifier}\u21B5 \u53D1\u9001 \xB7 Esc \u5B8C\u6210",
    sentToSession: "\u5DF2\u53D1\u9001\u5230\u5F53\u524D\u4F1A\u8BDD",
    sendingState: "\u6B63\u5728\u63D0\u4EA4\u2026",
    uncertainTitle: "\u53D1\u9001\u7ED3\u679C\u5F85\u6838\u5BF9",
    checkResult: "\u6838\u5BF9\u7ED3\u679C",
    backList: "\u8FD4\u56DE\u6D88\u606F\u5217\u8868",
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
    quoteSelection: "\u5F15\u7528\u9009\u4E2D",
    quoteHint: "\u628A\u5F53\u524D\u9009\u4E2D\u7684\u6587\u5B57\u4F5C\u4E3A\u5F15\u7528\uFF0C\u56DE\u590D\u5230\u5F53\u524D\u4F1A\u8BDD",
    selectionAvailable: "\u5DF2\u9009\u4E2D {count} \u5B57",
    quotedSelection: "\u5F15\u7528 {count} \u5B57",
    replyPlaceholder: "\u56DE\u590D\u9009\u4E2D\u7684\u5185\u5BB9\u2026",
    replySend: "\u6DFB\u52A0\u5230\u5F53\u524D\u4F1A\u8BDD",
    replySent: "\u5F15\u7528\u56DE\u590D\u5DF2\u6DFB\u52A0\u5230\u5F53\u524D\u4F1A\u8BDD\u3002",
    cancel: "\u53D6\u6D88",
    sendHint: "\u53D1\u9001",
    cancelHint: "\u53D6\u6D88",
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
    "errors.EMPTY_REPLY": "\u56DE\u590D\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    "errors.INVALID_QUOTE": "\u5F15\u7528\u5185\u5BB9\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6587\u5B57\u3002",
    "errors.QUOTE_TOO_LONG": "\u5F15\u7528\u8D85\u8FC7 4000 \u5B57\uFF0C\u8BF7\u7F29\u77ED\u9009\u62E9\u8303\u56F4\u3002",
    "errors.REPLY_TOO_LONG": "\u56DE\u590D\u8D85\u8FC7 16000 \u5B57\uFF0C\u8BF7\u7CBE\u7B80\u540E\u91CD\u8BD5\u3002",
    "errors.BAD_REQUEST_ID": "\u56DE\u590D\u8BF7\u6C42\u6807\u8BC6\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5F15\u7528\u56DE\u590D\u3002",
    "errors.FORBIDDEN": "\u5F53\u524D\u4F1A\u8BDD\u65E0\u6743\u8BBF\u95EE\u8FD9\u6B21\u56DE\u6EAF\u3002",
    "errors.RECOVERY_LOCKED": "\u540C\u4E00\u4F1A\u8BDD\u5B58\u5728\u8FD0\u884C\u4E2D\u6216\u4E2D\u65AD\u7684\u64CD\u4F5C\u9501\uFF1B\u8BF7\u6838\u5BF9\u4E0A\u6B21\u7ED3\u679C\uFF0C\u4E0D\u8981\u91CD\u590D\u6267\u884C\u3002",
    "errors.NO_PERSISTENCE": "\u5BBF\u4E3B\u672A\u786E\u8BA4\u5386\u53F2\u5DF2\u843D\u76D8\uFF0C\u53D1\u9001\u5DF2\u6682\u505C\uFF0C\u539F\u5185\u5BB9\u5907\u4EFD\u4FDD\u7559\u3002",
    "errors.SOURCE_CHANGED": "\u8BE5\u6D88\u606F\u5DF2\u88AB\u4FEE\u6539\u6216\u5220\u9664\uFF0C\u8BF7\u5237\u65B0\u5E76\u91CD\u65B0\u9009\u62E9\u3002",
    "errors.SESSION_CHANGED": "\u4F1A\u8BDD\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5E76\u6838\u5BF9\u3002",
    "errors.SESSION_NOT_ACTIVE": "\u4F1A\u8BDD\u5C1A\u672A\u52A0\u8F7D\uFF0C\u8BF7\u5728 dsh \u4E2D\u6253\u5F00\u540E\u91CD\u8BD5\u3002",
    "errors.BACKUP_INVALID": "\u5907\u4EFD\u6821\u9A8C\u5931\u8D25\uFF0C\u5DF2\u963B\u6B62\u91CD\u53D1\uFF0C\u8BF7\u4FDD\u7559\u539F\u4F1A\u8BDD\u5E76\u68C0\u67E5\u5B58\u50A8\u3002",
    "errors.STORAGE_UNAVAILABLE": "\u672C\u5730\u5907\u4EFD\u76EE\u5F55\u4E0D\u53EF\u7528\u3002\u8BF7\u68C0\u67E5 DSH_HOME \u7684\u5199\u5165\u6743\u9650\u6216\u78C1\u76D8\u7A7A\u95F4\u540E\u91CD\u8BD5\uFF1B\u4E0D\u4F1A\u53D1\u9001\u4EFB\u4F55\u5185\u5BB9\u3002"
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
    you: "You",
    editTitle: "Edit message",
    recoveredTitle: "Recovered message",
    emptyHint: "Once you send a message, its text and attachments can be recovered here.",
    pendingResume: "An earlier recovery was left unfinished",
    editAction: "Edit & resend",
    continueEdit: "Continue editing",
    finishEdit: "Done editing",
    sendEdited: "Send changes",
    retryOriginal: "Retry unchanged",
    retryHint: "Send the original content and ignore current edits",
    impact: "Impact & limits",
    toolChip: "{count} tool calls",
    stopFirst: "Stop the current generation first",
    stopHint: "Queued input is kept",
    queueChip: "{count} queued messages \u2014 clear the queue before sending",
    editHint: "{modifier}\u21B5 send \xB7 Esc done",
    sentToSession: "Sent in this conversation",
    sendingState: "Submitting\u2026",
    uncertainTitle: "Send result needs checking",
    checkResult: "Check result",
    backList: "Back to messages",
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
    quoteSelection: "Quote selection",
    quoteHint: "Quote the selected text and reply in this conversation",
    selectionAvailable: "{count} characters selected",
    quotedSelection: "Quoted {count} characters",
    replyPlaceholder: "Reply to the selected text\u2026",
    replySend: "Add to this conversation",
    replySent: "Quoted reply added to this conversation.",
    cancel: "Cancel",
    sendHint: "send",
    cancelHint: "cancel",
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
    "errors.EMPTY_REPLY": "The reply cannot be empty.",
    "errors.INVALID_QUOTE": "The quoted text is invalid. Select it again.",
    "errors.QUOTE_TOO_LONG": "The selection exceeds 4000 characters. Shorten it and try again.",
    "errors.REPLY_TOO_LONG": "The reply exceeds 16000 characters. Shorten it and try again.",
    "errors.BAD_REQUEST_ID": "The reply request id is invalid. Reopen the quoted reply.",
    "errors.FORBIDDEN": "This conversation cannot access that recovery.",
    "errors.RECOVERY_LOCKED": "Another running or interrupted operation holds this conversation lock. Check its outcome before proceeding.",
    "errors.NO_PERSISTENCE": "The host has not confirmed durable history. Sending paused; the backup remains.",
    "errors.SOURCE_CHANGED": "That message was modified or removed. Refresh and select it again.",
    "errors.SESSION_CHANGED": "The conversation state changed. Refresh and check it.",
    "errors.SESSION_NOT_ACTIVE": "Open this conversation in DSH before retrying.",
    "errors.BACKUP_INVALID": "Backup integrity failed. Replay was blocked; preserve the original conversation and inspect storage.",
    "errors.STORAGE_UNAVAILABLE": "The local backup directory is unavailable. Check write access and free space under DSH_HOME, then retry. Nothing was sent."
  }
};

// src/client/styles.js
var css = `
.dcr{--dcr-radius:10px;--dcr-soft:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);--dcr-softer:color-mix(in srgb,var(--dsw-alias-label-primary) 2.5%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;min-width:0;width:100%;box-sizing:border-box}
.dcr *{box-sizing:border-box}.dcr button,.dcr textarea{font:inherit;color:inherit}
.dcr button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;padding:5px 10px;cursor:pointer;min-height:30px;transition:background .15s ease,border-color .15s ease,opacity .15s ease}
.dcr button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dcr button:disabled{opacity:.45;cursor:default}
.dcr button.dcr-primary{background:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.dcr button.dcr-primary:hover:not(:disabled){background:var(--dsw-alias-label-primary);opacity:.9}
.dcr button.dcr-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary);padding-left:7px;padding-right:7px}
.dcr button.dcr-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.dcr button.dcr-link{border:0;background:none;padding:0;min-height:0;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr button.dcr-link:hover:not(:disabled){background:none;color:var(--dsw-alias-label-primary);text-decoration:underline}
.dcr button.dcr-iconbtn{width:28px;height:28px;min-height:28px;padding:0;border-color:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
.dcr button:focus-visible,.dcr textarea:focus-visible,.dcr input:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:2px}
.dcr-bar{display:flex;align-items:center;gap:8px;padding:4px 2px}.dcr-bar>button:first-child{border-color:transparent;padding-left:4px;padding-right:6px}
.dcr-bar-actions{display:flex;align-items:center;gap:6px;margin-left:auto;min-width:0}
.dcr-muted{color:var(--dsw-alias-label-secondary)}.dcr-tagline{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}
.dcr-quote-trigger{border-style:dashed!important;color:var(--dsw-alias-label-secondary);white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.dcr-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-elevation-panel,0 1px 2px rgba(0,0,0,.04));margin:4px 0 9px;overflow:hidden;animation:dcr-in .16s ease}
@keyframes dcr-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.dcr-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}
.dcr-head-main{display:flex;align-items:center;gap:6px;min-width:0}.dcr-head h3{font-size:12px;margin:0;font-weight:600;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcr-head .dcr-actions{gap:4px}
.dcr-scroll{max-height:min(52vh,460px);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.dcr-list{list-style:none;margin:0;padding:5px}.dcr-list li{margin:2px 0}
.dcr-list button{position:relative;display:block;width:100%;text-align:left;border-color:transparent;padding:9px 30px 9px 10px;border-radius:8px}
.dcr-list button:hover:not(:disabled){border-color:var(--dsw-alias-border-l1)}
.dcr-list-chevron{position:absolute;right:9px;top:50%;transform:translateY(-50%);color:var(--dsw-alias-label-tertiary);opacity:0;transition:opacity .15s ease}
.dcr-list button:hover .dcr-list-chevron,.dcr-list button:focus-visible .dcr-list-chevron{opacity:1}
.dcr-preview{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dcr-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-top:4px}
.dcr-body{padding:12px 14px}.dcr-note{color:var(--dsw-alias-label-secondary);margin:0 0 9px;font-size:11px;overflow-wrap:anywhere}
.dcr-error{color:var(--dsw-alias-state-error-primary);padding:9px 14px;overflow-wrap:anywhere;font-size:11px}.dcr-error .dcr-link{margin-left:8px}
.dcr-warning{border-left:2px solid var(--dsw-alias-border-l1);padding-left:10px}
.dcr-message{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dcr-softer);padding:11px 12px}
.dcr-message-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.dcr-avatar{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--dcr-soft);color:var(--dsw-alias-label-secondary);font-size:11px;flex:none}
.dcr-message-meta{display:flex;flex-direction:column;line-height:1.25;min-width:0}.dcr-message-meta strong{font-size:11.5px;font-weight:600}.dcr-message-meta span{color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-warn-chip{margin-left:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:2px 8px;color:var(--dsw-alias-label-secondary);font-size:10.5px;white-space:nowrap}
.dcr-message-body{display:flex;flex-direction:column;gap:8px}
.dcr-message-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:12.5px}
.dcr-textblock{display:flex;flex-direction:column;gap:3px}
.dcr-textlabel{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dcr textarea{display:block;width:100%;min-height:44px;max-height:240px;resize:none;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base);padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}
.dcr textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.dcr-edit-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-edit-tools [role="status"]{margin-right:auto}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:5px 9px;max-width:100%;overflow-wrap:anywhere}.dcr-chip span{min-width:0}
.dcr-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.dcr-foot{border-top:1px solid var(--dsw-alias-border-l1);display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;flex-wrap:wrap}
.dcr-footmeta{display:flex;flex-direction:column;gap:2px;min-width:0}.dcr-model{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.dcr-hint{color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-variant-numeric:tabular-nums}
.dcr-details{margin:11px 0 0;border-top:1px solid var(--dsw-alias-border-l1);padding-top:9px}
.dcr-details summary{display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:11px;list-style:none;user-select:none}
.dcr-details summary::-webkit-details-marker{display:none}.dcr-details summary svg{transition:transform .15s ease}
.dcr-details[open] summary svg{transform:rotate(90deg)}
.dcr-details .dcr-note{margin-top:8px;margin-bottom:0}.dcr-details .dcr-note+.dcr-note{margin-top:6px}
.dcr-check{display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);margin:11px 0 0}
.dcr-check input{margin-top:3px;accent-color:var(--dsw-alias-label-primary)}.dcr-check span{display:flex;flex-direction:column;gap:1px}.dcr-check small{color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-status{padding:12px 14px}.dcr-status-card{display:flex;flex-direction:column;gap:9px;background:var(--dcr-softer);border-top:1px solid var(--dsw-alias-border-l1)}
.dcr-status-line{display:flex;gap:8px;align-items:flex-start}.dcr-status-line strong{font-size:11.5px}.dcr-status-line p{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-ok{color:var(--dsw-alias-label-primary);display:inline-flex}.dcr-pending-icon{color:var(--dsw-alias-label-secondary);display:inline-flex}
.dcr-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:28px 16px;color:var(--dsw-alias-label-secondary)}
.dcr-empty svg{color:var(--dsw-alias-label-tertiary)}.dcr-empty strong{font-size:12px;color:var(--dsw-alias-label-primary)}.dcr-empty span{font-size:11px;max-width:300px}
.dcr-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dcr-softer);font-size:11px}
.dcr-banner div{display:flex;gap:7px;align-items:baseline;min-width:0}.dcr-banner strong{font-weight:600}
.dcr-skeleton{display:flex;flex-direction:column;gap:9px;padding:14px}.dcr-skeleton span{display:block;height:34px;border-radius:8px;background:var(--dcr-soft);animation:dcr-pulse 1.4s ease-in-out infinite}
.dcr-skeleton span:nth-child(2){width:86%;animation-delay:.15s}.dcr-skeleton span:nth-child(3){width:72%;animation-delay:.3s}
@keyframes dcr-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.dcr-notice{margin:10px 14px 0;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:11px;display:flex;align-items:center;gap:6px;animation:dcr-in .16s ease}
.dcr-quote-prompt{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-reply{border-bottom:1px solid var(--dsw-alias-border-l1);padding:12px 14px;background:var(--dcr-softer)}
.dcr-quote{border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-label-tertiary);border-radius:8px;background:var(--dcr-soft);margin-bottom:9px;overflow:hidden}
.dcr-quote-head{display:flex;align-items:center;gap:6px;padding:6px 9px;color:var(--dsw-alias-label-secondary);font-size:11px}
.dcr-quote-head span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcr-quote-head button{border:0;min-height:22px;padding:0 4px;color:var(--dsw-alias-label-tertiary)}
.dcr-quote-body{margin:0;padding:0 10px 9px;max-height:118px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.6;overscroll-behavior:contain}
.dcr-reply-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;flex-wrap:wrap}
@media(max-width:520px){.dcr-tagline{display:none}.dcr-head,.dcr-foot,.dcr-body,.dcr-reply{padding:10px}.dcr-foot .dcr-actions{width:100%}.dcr-foot .dcr-actions button{flex:1}.dcr-scroll{max-height:46vh}.dcr-quote-trigger{max-width:52%}.dcr-message-meta span{white-space:normal}.dcr-model{max-width:180px}}
@media(prefers-reduced-motion:reduce){.dcr *{animation:none!important;transition:none!important;scroll-behavior:auto}}
`;

// src/client/index.jsx
var NS = "dsh-content-rollback";
var inject = ["slots", "locale", "remote", "remote.commands"];
var QUOTE_LIMIT = 4e3;
var PRIMARY_MODIFIER = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? "") ? "\u2318" : "Ctrl";
function errorText(t, code) {
  return translations.en[`errors.${code}`] ? t(`errors.${code}`) : t("error", { code });
}
function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
var Icon = ({ children, size = 15 }) => /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, children);
var RecoveryIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M5 8h10a6 6 0 0 1 0 12H9M5 8l4-4M5 8l4 4", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var QuoteIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M9 7H5v6h4c0 2-1 3-3 4M19 7h-4v6h4c0 2-1 3-3 4", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var RetryIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 11a8 8 0 1 1 2.3 5.7M4 5v6h6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var EditIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 20h4l11-11-4-4L4 16v4Zm9-13 4 4", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var SendIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 19V5m0 0-6 6m6-6 6 6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var CheckIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 16 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m5 12 4.5 4.5L19 7", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }));
var InfoIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 16 }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "8.5", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 11v5m0-8h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
var ChevronIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 13 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m9 6 6 6-6 6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
function AutoTextarea({ value, onChange, readOnly, label, autoFocus, placeholder }) {
  const ref = (0, import_react.useRef)(null);
  (0, import_react.useLayoutEffect)(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [value]);
  (0, import_react.useEffect)(() => {
    if (!autoFocus) return;
    const element = ref.current;
    if (element) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [autoFocus]);
  return /* @__PURE__ */ import_react.default.createElement("textarea", { ref, rows: 1, value, readOnly, "aria-label": label, placeholder, onChange, spellCheck: false });
}
function useSelection() {
  const [selection, setSelection] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection("");
        return;
      }
      const node = sel.anchorNode;
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      if (element?.closest?.(".dcr")) return;
      const text = sel.toString().replace(/\s+$/, "").trim();
      setSelection(text.length > QUOTE_LIMIT ? text.slice(0, QUOTE_LIMIT) : text);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    document.addEventListener("selectionchange", schedule);
    return () => {
      document.removeEventListener("selectionchange", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return [selection, setSelection];
}
function QuoteReply({ quote, request, onClose, onSent, t }) {
  const [text, setText] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const requestId = (0, import_react.useRef)(newRequestId());
  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await request({ action: "reply", text, quote, requestId: requestId.current });
      setText("");
      onSent();
    } catch (cause) {
      setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-reply", onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-quote" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-quote-head" }, /* @__PURE__ */ import_react.default.createElement(QuoteIcon, null), /* @__PURE__ */ import_react.default.createElement("span", null, t("quotedSelection", { count: quote.length })), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onClose, "aria-label": t("close") }, "\xD7")), /* @__PURE__ */ import_react.default.createElement("blockquote", { className: "dcr-quote-body" }, quote)), /* @__PURE__ */ import_react.default.createElement(AutoTextarea, { value: text, onChange: (event) => setText(event.target.value), label: t("replyPlaceholder"), placeholder: t("replyPlaceholder"), autoFocus: true }), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-error", role: "alert" }, errorText(t, error)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-reply-foot" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-hint" }, PRIMARY_MODIFIER, "\u21B5 ", t("sendHint"), " \xB7 Esc ", t("cancelHint")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: onClose }, t("cancel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", disabled: busy || !text.trim(), onClick: () => void send() }, /* @__PURE__ */ import_react.default.createElement(SendIcon, null), t(busy ? "working" : "replySend")))));
}
function Panel({ sessionId, remote, t }) {
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [listing, setListing] = (0, import_react.useState)(null);
  const [selected, setSelected] = (0, import_react.useState)(null);
  const [content, setContent] = (0, import_react.useState)([]);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [errorDetail, setErrorDetail] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [saveState, setSaveState] = (0, import_react.useState)("saved");
  const [stop, setStop] = (0, import_react.useState)(false);
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [conflict, setConflict] = (0, import_react.useState)(null);
  const [quote, setQuote] = (0, import_react.useState)("");
  const [selection, setSelection] = useSelection();
  const active = (0, import_react.useRef)(true);
  const inFlight = (0, import_react.useRef)(false);
  const writer = (0, import_react.useRef)(null);
  const trigger = (0, import_react.useRef)(null);
  const saveGeneration = (0, import_react.useRef)(0);
  const request = (value) => callRecovery(typeof fetch === "function" ? fetch.bind(globalThis) : null, remote, sessionId, value);
  const report = (cause) => {
    if (active.current) {
      setError(cause.code ?? "RECOVERY_FAILED");
      setErrorDetail(cause.message ?? null);
    }
  };
  (0, import_react.useEffect)(() => {
    active.current = true;
    return () => {
      active.current = false;
      void writer.current?.flush().catch(() => {
      });
    };
  }, []);
  (0, import_react.useEffect)(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      if (active.current) setNotice(null);
    }, 4e3);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
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
  function quoteSelection() {
    if (!selection) return;
    setQuote(selection);
    setExpanded(true);
    setSelection("");
    window.getSelection()?.removeAllRanges();
  }
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
    if (result.error) {
      setError(result.error);
      setErrorDetail(null);
    }
    setContent(next);
    setStop(false);
    setEditing(result.state === "ready");
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
  async function beginEdit() {
    if (selected.state !== "prepared") {
      setEditing(true);
      return;
    }
    const result = await request({ action: "execute", token: selected.token, mode: "edit" });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) {
      setError(result.error);
      setErrorDetail(null);
      return;
    }
    setEditing(true);
  }
  async function execute(mode) {
    await writer.current?.flush();
    const result = await request({ action: "execute", token: selected.token, mode, stop, route: listing?.route, ...mode === "send" ? { revision: writer.current?.revision ?? 0 } : {} });
    if (!active.current) return;
    setSelected((previous) => ({ ...previous, ...result }));
    if (result.error) {
      setError(result.error);
      setErrorDetail(null);
    }
    if (["accepted", "uncertain", "sending"].includes(result.state)) setEditing(false);
    await refresh();
  }
  async function check() {
    const result = await request({ action: "status", token: selected.token });
    if (active.current) setSelected((previous) => ({ ...previous, ...result }));
  }
  function backToList() {
    setEditing(false);
    setSelected(null);
    void run(() => refresh());
  }
  const finished = selected && ["accepted", "sending", "uncertain"].includes(selected.state);
  const canEdit = selected?.state === "ready";
  const isEditing = Boolean(editing && canEdit);
  const close = () => {
    setExpanded(false);
    trigger.current?.focus();
  };
  const sendQuote = () => {
    setQuote("");
    setNotice(t("replySent"));
  };
  const activity = listing?.activity;
  const firstTextIndex = content.findIndex((part) => part.type === "text");
  const textCount = content.filter((part) => part.type === "text").length;
  let textIndex = 0;
  return /* @__PURE__ */ import_react.default.createElement("section", { className: "dcr", "aria-label": t("title"), onKeyDown: (event) => {
    if (!expanded) return;
    if (event.key === "Escape" && !quote) {
      if (isEditing) {
        event.stopPropagation();
        setEditing(false);
      } else {
        event.stopPropagation();
        close();
      }
    } else if (isEditing && event.key === "Enter" && (event.metaKey || event.ctrlKey) && !busy && !conflict && saveState !== "saveFailed") {
      event.preventDefault();
      void run(() => execute("send"));
    }
  } }, /* @__PURE__ */ import_react.default.createElement("style", null, css), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-bar" }, /* @__PURE__ */ import_react.default.createElement("button", { ref: trigger, type: "button", "aria-expanded": expanded, onClick: () => {
    setExpanded(!expanded);
    if (!expanded) void run(() => refresh());
  } }, /* @__PURE__ */ import_react.default.createElement(RecoveryIcon, null), t("title")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-tagline" }, t("tagline")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-bar-actions" }, selection && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-quote-trigger", title: t("quoteHint"), onPointerDown: (event) => event.preventDefault(), onClick: quoteSelection }, /* @__PURE__ */ import_react.default.createElement(QuoteIcon, null), t("quoteSelection")), !expanded && listing?.pending && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => resume(listing.pending.token)) }, t("resume")))), expanded && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-panel", "aria-busy": busy }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dcr-head" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-head-main" }, selected && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-iconbtn", "aria-label": t("backList"), title: t("backList"), onClick: backToList }, "\u2190"), /* @__PURE__ */ import_react.default.createElement("h3", null, selected ? isEditing ? t("editTitle") : t("recoveredTitle") : t("history"))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-ghost", disabled: busy, onClick: () => void run(() => refresh()) }, t("refresh")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-iconbtn", onClick: close, "aria-label": t("close") }, "\xD7"))), quote && /* @__PURE__ */ import_react.default.createElement(QuoteReply, { quote, request, onClose: () => setQuote(""), onSent: sendQuote, t }), notice && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-notice", role: "status" }, /* @__PURE__ */ import_react.default.createElement(CheckIcon, null), notice), selection && !quote && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-quote-prompt" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("selectionAvailable", { count: selection.length })), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onPointerDown: (event) => event.preventDefault(), onClick: quoteSelection }, /* @__PURE__ */ import_react.default.createElement(QuoteIcon, null), t("quoteSelection"))), error && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-error", role: "alert" }, errorText(t, error), !translations.en[`errors.${error}`] && errorDetail && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-muted" }, " \xB7 ", errorDetail), error === "DRAFT_CONFLICT" && selected && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-link", onClick: () => void run(async () => {
    const result = await request({ action: "load-draft", token: selected.token });
    if (active.current) applyDraft(result);
  }) }, t("reloadDraft"))), listing?.archiveIssue && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-error", role: "status" }, t("backupIssue", { code: listing.archiveIssue })), !selected ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-scroll" }, listing?.pending && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-banner" }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("strong", null, t("pendingResume")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-muted" }, "#", listing.pending.seq)), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => resume(listing.pending.token)) }, t("resume"))), !listing ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-skeleton", "aria-label": t("loading") }, [0, 1, 2].map((row) => /* @__PURE__ */ import_react.default.createElement("span", { key: row }))) : listing.items.length === 0 ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-empty" }, /* @__PURE__ */ import_react.default.createElement(RecoveryIcon, null), /* @__PURE__ */ import_react.default.createElement("strong", null, t("empty")), /* @__PURE__ */ import_react.default.createElement("span", null, t("emptyHint"))) : /* @__PURE__ */ import_react.default.createElement("ol", { className: "dcr-list" }, listing.items.map((item) => /* @__PURE__ */ import_react.default.createElement("li", { key: item.seq }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: busy, onClick: () => void run(() => choose(item.seq)) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-preview" }, item.preview || t("attachmentOnly")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-meta" }, /* @__PURE__ */ import_react.default.createElement("time", null, new Date(item.time).toLocaleString()), /* @__PURE__ */ import_react.default.createElement("span", null, "#", item.seq), item.attachments.map((part, i) => /* @__PURE__ */ import_react.default.createElement("span", { key: i }, part.name || t(part.type === "image" ? "image" : "file")))), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-list-chevron" }, /* @__PURE__ */ import_react.default.createElement(ChevronIcon, null)))))), listing?.hasMore && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-body" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-ghost", disabled: busy, onClick: () => void run(() => refresh(true)) }, t("more")))) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-scroll" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-body" }, /* @__PURE__ */ import_react.default.createElement("article", { className: "dcr-message" }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dcr-message-head" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-avatar" }, t("you")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-message-meta" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t("you")), /* @__PURE__ */ import_react.default.createElement("span", null, selected.time ? new Date(selected.time).toLocaleString() : "", selected.time ? " \xB7 " : "", "#", selected.seq)), selected.toolCalls > 0 && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-warn-chip" }, t("toolChip", { count: selected.toolCalls }))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-message-body" }, content.map((part, index) => part.type === "text" ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-textblock", key: index }, isEditing && textCount > 1 && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-textlabel" }, t("part", { index: ++textIndex })), isEditing ? /* @__PURE__ */ import_react.default.createElement(AutoTextarea, { value: part.text, readOnly: busy || Boolean(conflict), label: t("part", { index: textIndex || 1 }), autoFocus: index === firstTextIndex, onChange: (event) => edit(index, event.target.value) }) : /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-message-text" }, part.text)) : /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-chip", key: index }, /* @__PURE__ */ import_react.default.createElement("span", null, t(part.type === "image" ? "image" : "file"), " \xB7 ", part.attachment?.name || part.attachment?.attachmentId), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-muted" }, part.attachment?.bytes ?? 0, " B")))), isEditing && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-edit-tools" }, /* @__PURE__ */ import_react.default.createElement("span", { role: "status", "aria-live": "polite" }, t(saveState)), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-link", disabled: busy || Boolean(conflict), onClick: () => {
    const next = structuredClone(selected.originalContent);
    setContent(next);
    persist(next);
  } }, t("restore")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-link", onClick: () => setEditing(false) }, t("finishEdit"))), conflict && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-warning" }, /* @__PURE__ */ import_react.default.createElement("p", null, t("conflict")), /* @__PURE__ */ import_react.default.createElement("pre", { className: "dcr-preview" }, conflict.filter((part) => part.type === "text").map((part) => part.text).join("\n")), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", onClick: () => {
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
  } }, t("useSaved"))))), !finished && /* @__PURE__ */ import_react.default.createElement("details", { className: "dcr-details" }, /* @__PURE__ */ import_react.default.createElement("summary", null, /* @__PURE__ */ import_react.default.createElement(ChevronIcon, null), t("impact")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("scope")), selected.toolCalls > 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note dcr-warning" }, t("tools", { count: selected.toolCalls })), content.some((part) => part.type !== "text") && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("media")), selected.hasPathReferences && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note dcr-warning" }, t("paths")), /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note" }, t("preserveDraft"))), activity?.running && /* @__PURE__ */ import_react.default.createElement("label", { className: "dcr-check" }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: stop, onChange: (event) => setStop(event.target.checked) }), /* @__PURE__ */ import_react.default.createElement("span", null, t("stopFirst"), /* @__PURE__ */ import_react.default.createElement("small", null, t("stopHint")))), activity?.queued > 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-note dcr-warning" }, t("queueChip", { count: activity.queued }))), finished && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-status dcr-status-card", role: "status" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-status-line" }, /* @__PURE__ */ import_react.default.createElement("span", { className: selected.state === "accepted" ? "dcr-ok" : "dcr-pending-icon" }, selected.state === "accepted" ? /* @__PURE__ */ import_react.default.createElement(CheckIcon, null) : /* @__PURE__ */ import_react.default.createElement(InfoIcon, null)), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("strong", null, t(selected.state === "accepted" ? "sentToSession" : selected.state === "sending" ? "sendingState" : "uncertainTitle")), selected.state === "uncertain" && /* @__PURE__ */ import_react.default.createElement("p", null, t("uncertain")), selected.state === "accepted" && /* @__PURE__ */ import_react.default.createElement("p", null, t("accepted")))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, selected.state === "uncertain" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-ghost", disabled: busy, onClick: () => void run(check) }, t("checkResult")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", onClick: backToList }, t("backList"))))), !finished && /* @__PURE__ */ import_react.default.createElement("footer", { className: "dcr-foot" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-footmeta" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-model" }, t("model"), " \xB7 ", listing?.route?.model ?? t("noModel")), isEditing && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-hint" }, t("editHint", { modifier: PRIMARY_MODIFIER }))), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-actions" }, (selected.state === "prepared" || selected.state === "ready") && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-ghost", title: t("retryHint"), disabled: busy, onClick: () => void run(() => execute("retry")) }, /* @__PURE__ */ import_react.default.createElement(RetryIcon, null), t("retryOriginal")), selected.state === "prepared" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", disabled: busy, onClick: () => void run(beginEdit) }, /* @__PURE__ */ import_react.default.createElement(EditIcon, null), t(busy ? "working" : "editAction")), selected.state === "ready" && !isEditing && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-ghost", disabled: busy, onClick: () => setEditing(true) }, /* @__PURE__ */ import_react.default.createElement(EditIcon, null), t("continueEdit")), selected.state === "ready" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-primary", disabled: busy || Boolean(conflict) || saveState === "saveFailed", onClick: () => void run(() => execute("send")) }, /* @__PURE__ */ import_react.default.createElement(SendIcon, null), t(busy ? "working" : "sendEdited")))))));
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
