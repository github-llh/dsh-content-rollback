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

// src/client/locale.js
var translations = {
  zh: {
    historyTitle: "\u56DE\u6EAF\u6D88\u606F",
    editTitle: "\u7F16\u8F91\u6D88\u606F",
    back: "\u8FD4\u56DE",
    historyHint: "\u627E\u56DE\u3001\u7F16\u8F91\u6216\u91CD\u53D1\u5DF2\u53D1\u9001\u7684\u5185\u5BB9\uFF0C\u4E5F\u53EF\u91CD\u8BD5\u6700\u8FD1\u4E00\u8F6E",
    close: "\u6536\u8D77",
    refresh: "\u5237\u65B0",
    loading: "\u6B63\u5728\u8BFB\u53D6\u2026",
    empty: "\u8FD8\u6CA1\u6709\u53EF\u56DE\u6EAF\u7684\u6D88\u606F",
    emptyHint: "\u53D1\u9001\u4E00\u6761\u6D88\u606F\u540E\u518D\u56DE\u6765\u3002",
    more: "\u52A0\u8F7D\u66F4\u65E9\u6D88\u606F",
    attachmentOnly: "\u4EC5\u9644\u4EF6\u6D88\u606F",
    toolChip: "\u542B {count} \u6B21\u5DE5\u5177\u8C03\u7528",
    you: "\u4F60",
    image: "\u56FE\u7247",
    file: "\u9644\u4EF6",
    part: "\u6587\u5B57\u7247\u6BB5 {index}",
    messageText: "\u6D88\u606F\u5185\u5BB9",
    copy: "\u590D\u5236",
    copied: "\u5DF2\u590D\u5236",
    editAndResend: "\u7F16\u8F91\u5E76\u91CD\u53D1",
    resend: "\u539F\u6837\u91CD\u53D1",
    resendHint: "\u5728\u5F53\u524D\u4F1A\u8BDD\u518D\u53D1\u4E00\u6B21\u539F\u6587",
    retryTurn: "\u91CD\u8BD5\u672C\u8F6E",
    retryTurnHint: "\u5728\u5F53\u524D\u4F1A\u8BDD\u91CD\u65B0\u53D1\u9001\u8FD9\u6761\u56DE\u7B54\u5BF9\u5E94\u7684\u6D88\u606F\uFF1B\u65E7\u56DE\u7B54\u4F1A\u4FDD\u7559",
    retryLastTurn: "\u91CD\u8BD5\u6700\u8FD1\u4E00\u8F6E",
    retryLastHint: "\u91CD\u65B0\u53D1\u9001\u4E0A\u4E00\u6761\u7528\u6237\u6D88\u606F",
    retryStarted: "\u5DF2\u91CD\u65B0\u53D1\u9001\uFF0C\u6B63\u5728\u751F\u6210\u65B0\u56DE\u7B54",
    sending: "\u6B63\u5728\u53D1\u9001\u2026",
    sentAgain: "\u5DF2\u91CD\u65B0\u53D1\u9001",
    working: "\u5904\u7406\u4E2D\u2026",
    cancel: "\u53D6\u6D88",
    sendEdited: "\u53D1\u9001",
    resendOriginal: "\u91CD\u53D1",
    editHint: "{modifier}\u21B5 \u53D1\u9001 \xB7 Esc \u53D6\u6D88",
    editorNote: "\u5728\u5F53\u524D\u4F1A\u8BDD\u91CD\u53D1\uFF1B\u65E7\u6D88\u606F\u548C\u5DE5\u5177\u526F\u4F5C\u7528\u90FD\u4F1A\u4FDD\u7559\u3002",
    toolCallsWarning: "\u8FD9\u6761\u6D88\u606F\u4E4B\u540E\u6709 {count} \u6B21\u5DE5\u5177\u8C03\u7528\uFF1B\u91CD\u53D1\u4E0D\u4F1A\u64A4\u9500\u5B83\u4EEC\uFF0C\u53EF\u80FD\u518D\u6B21\u6267\u884C\u3002",
    modelLine: "\u5F53\u524D\u6A21\u578B \xB7 {model}",
    noModel: "\u672A\u9009\u62E9\u6A21\u578B",
    runningHint: "\u4F1A\u8BDD\u6B63\u5728\u751F\u6210\uFF1B\u8BF7\u5148\u505C\u6B62\u518D\u91CD\u53D1",
    pendingResume: "\u6709\u4E00\u6761\u672A\u5B8C\u6210\u7684\u7F16\u8F91\u8349\u7A3F",
    resume: "\u7EE7\u7EED\u7F16\u8F91",
    quoteSelection: "\u5F15\u7528\u9009\u4E2D",
    quoteHint: "\u628A\u9009\u4E2D\u7684\u6587\u5B57\u4F5C\u4E3A\u5F15\u7528\uFF0C\u56DE\u590D\u5230\u5F53\u524D\u4F1A\u8BDD",
    quotedSelection: "\u5F15\u7528 {count} \u5B57",
    replyPlaceholder: "\u56DE\u590D\u9009\u4E2D\u7684\u5185\u5BB9\u2026",
    replySend: "\u6DFB\u52A0\u5230\u5F53\u524D\u4F1A\u8BDD",
    replySent: "\u5F15\u7528\u56DE\u590D\u5DF2\u6DFB\u52A0\u5230\u5F53\u524D\u4F1A\u8BDD\u3002",
    backupIssue: "\u540E\u53F0\u5907\u4EFD\u672A\u5B8C\u6210\uFF1A{code}\uFF1B\u53D1\u9001\u524D\u4F1A\u91CD\u65B0\u6821\u9A8C\u3002",
    uncertain: "\u4E0A\u6B21\u53D1\u9001\u7ED3\u679C\u8FD8\u4E0D\u786E\u5B9A\u3002\u4E3A\u907F\u514D\u91CD\u590D\uFF0C\u5DF2\u6682\u505C\u91CD\u53D1\uFF1B\u8BF7\u5148\u6838\u5BF9\u3002",
    checkResult: "\u6838\u5BF9",
    checkedSent: "\u5DF2\u786E\u8BA4\u9001\u8FBE\u5F53\u524D\u4F1A\u8BDD",
    stillUncertain: "\u4ECD\u672A\u786E\u8BA4\uFF0C\u8BF7\u7A0D\u540E\u518D\u6838\u5BF9",
    error: "\u64CD\u4F5C\u672A\u5B8C\u6210\uFF1A{code}\u3002\u539F\u4F1A\u8BDD\u5185\u5BB9\u672A\u88AB\u5220\u9664\u3002",
    "errors.UNAVAILABLE": "\u63D2\u4EF6\u6216\u547D\u4EE4\u670D\u52A1\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F dsh\u3002",
    "errors.DISCONNECTED": "\u8FDE\u63A5\u4E2D\u65AD\u3002\u8BF7\u91CD\u8FDE\u540E\u6838\u5BF9\u53D1\u9001\u7ED3\u679C\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002",
    "errors.FORBIDDEN": "\u6CA1\u6709\u6743\u9650\u5728\u5F53\u524D\u4F1A\u8BDD\u6267\u884C\u8FD9\u4E2A\u64CD\u4F5C\u3002",
    "errors.MESSAGE_NOT_FOUND": "\u6D88\u606F\u4E0D\u5B58\u5728\uFF0C\u6216\u4E0D\u662F\u7528\u6237\u53D1\u9001\u7684\u6D88\u606F\u3002",
    "errors.BAD_MESSAGE_ID": "\u627E\u4E0D\u5230\u8FD9\u6761\u56DE\u7B54\u5BF9\u5E94\u7684\u7528\u6237\u6D88\u606F\u3002",
    "errors.UNSUPPORTED_CONTENT": "\u6D88\u606F\u5305\u542B\u5F53\u524D\u63D2\u4EF6\u672A\u8BC6\u522B\u7684\u5185\u5BB9\uFF0C\u5DF2\u963B\u6B62\u6709\u635F\u91CD\u53D1\u3002",
    "errors.SESSION_NOT_ACTIVE": "\u5F53\u524D\u4F1A\u8BDD\u672A\u6FC0\u6D3B\uFF0C\u8BF7\u56DE\u5230\u8BE5\u4F1A\u8BDD\u540E\u518D\u8BD5\u3002",
    "errors.SESSION_RUNNING": "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u5728\u751F\u6210\uFF0C\u8BF7\u5148\u505C\u6B62\uFF0C\u518D\u91CD\u53D1\u3002",
    "errors.PENDING_QUEUE": "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6709\u6392\u961F\u6D88\u606F\uFF0C\u8BF7\u5148\u5904\u7406\u961F\u5217\u3002",
    "errors.STOP_TIMEOUT": "\u505C\u6B62\u5C1A\u672A\u5B8C\u6210\uFF1B\u8BF7\u7B49\u5F85 dsh \u771F\u6B63\u505C\u6B62\u540E\u518D\u8BD5\u3002",
    "errors.MODEL_CHANGED": "\u53D1\u9001\u6A21\u578B\u5DF2\u53D8\u5316\uFF0C\u5C1A\u672A\u53D1\u9001\uFF1B\u8BF7\u786E\u8BA4\u5F53\u524D\u6A21\u578B\u540E\u91CD\u8BD5\u3002",
    "errors.MODEL_NO_IMAGES": "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u56FE\u7247\uFF1B\u8BF7\u6362\u7528\u652F\u6301\u56FE\u7247\u7684\u6A21\u578B\u3002",
    "errors.OPEN_EDITOR_FIRST": "\u8BF7\u5148\u8FDB\u5165\u7F16\u8F91\u518D\u53D1\u9001\u4FEE\u6539\u540E\u7684\u5185\u5BB9\u3002",
    "errors.DRAFT_CONFLICT": "\u8349\u7A3F\u5DF2\u5728\u53E6\u4E00\u9875\u9762\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u540E\u518D\u8BD5\u3002",
    "errors.REQUEST_CONFLICT": "\u540C\u4E00\u6B21\u53D1\u9001\u8BF7\u6C42\u7684\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u63D0\u4EA4\u3002",
    "errors.EMPTY_MESSAGE": "\u4E0D\u80FD\u53D1\u9001\u6CA1\u6709\u6587\u5B57\u548C\u9644\u4EF6\u7684\u7A7A\u6D88\u606F\u3002",
    "errors.EMPTY_REPLY": "\u56DE\u590D\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    "errors.REPLY_TOO_LONG": "\u56DE\u590D\u5185\u5BB9\u8FC7\u957F\u3002",
    "errors.QUOTE_TOO_LONG": "\u5F15\u7528\u7684\u5185\u5BB9\u8FC7\u957F\uFF0C\u8BF7\u51CF\u5C11\u9009\u4E2D\u8303\u56F4\u3002",
    "errors.REQUEST_TOO_LARGE": "\u8BF7\u6C42\u5185\u5BB9\u8FC7\u5927\u3002",
    "errors.BAD_REQUEST": "\u8BF7\u6C42\u683C\u5F0F\u65E0\u6548\u3002",
    "errors.BAD_ACTION": "\u4E0D\u652F\u6301\u7684\u64CD\u4F5C\u3002",
    "errors.BAD_SEQUENCE": "\u6D88\u606F\u4F4D\u7F6E\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
    "errors.BAD_TOKEN": "\u64CD\u4F5C\u6807\u8BC6\u65E0\u6548\u3002",
    "errors.BAD_MODE": "\u53D1\u9001\u6A21\u5F0F\u65E0\u6548\u3002",
    "errors.BAD_REQUEST_ID": "\u8BF7\u6C42\u6807\u8BC6\u65E0\u6548\u3002",
    "errors.BAD_ROUTE": "\u6A21\u578B\u4FE1\u606F\u65E0\u6548\u3002",
    "errors.INVALID_EDITS": "\u7F16\u8F91\u5185\u5BB9\u4E0E\u6D88\u606F\u7ED3\u6784\u4E0D\u4E00\u81F4\u3002",
    "errors.SOURCE_CHANGED": "\u539F\u6D88\u606F\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
    "errors.BACKUP_INVALID": "\u672C\u5730\u5907\u4EFD\u6821\u9A8C\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
    "errors.OPERATION_NOT_FOUND": "\u627E\u4E0D\u5230\u8FD9\u6B21\u53D1\u9001\u64CD\u4F5C\u3002",
    "errors.NOT_EDITABLE": "\u8FD9\u6B21\u64CD\u4F5C\u5F53\u524D\u4E0D\u53EF\u7F16\u8F91\u3002",
    "errors.RECOVERY_LOCKED": "\u53E6\u4E00\u4E2A\u56DE\u6EAF\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002",
    "errors.NO_PERSISTENCE": "\u5F53\u524D\u90E8\u7F72\u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD\u6301\u4E45\u5316\uFF0C\u5DF2\u963B\u6B62\u53D1\u9001\u3002",
    "errors.STORAGE_UNAVAILABLE": "\u672C\u5730\u5907\u4EFD\u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u5DF2\u963B\u6B62\u53D1\u9001\u3002",
    "errors.SESSION_CHANGED": "\u4F1A\u8BDD\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002",
    "errors.SEND_UNCERTAIN": "\u53D1\u9001\u7ED3\u679C\u4E0D\u786E\u5B9A\uFF0C\u8BF7\u5148\u6838\u5BF9\u518D\u91CD\u53D1\u3002",
    "errors.RECOVERY_FAILED": "\u56DE\u6EAF\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    "errors.UNLOADED": "\u63D2\u4EF6\u5DF2\u5378\u8F7D\uFF0C\u8BF7\u91CD\u542F dsh\u3002"
  },
  en: {
    historyTitle: "Sent messages",
    editTitle: "Edit message",
    back: "Back",
    historyHint: "Recover, edit or resend a sent message, or retry the last turn",
    close: "Close",
    refresh: "Refresh",
    loading: "Loading\u2026",
    empty: "No sent messages yet",
    emptyHint: "Send a message, then come back.",
    more: "Load earlier messages",
    attachmentOnly: "Attachments only",
    toolChip: "{count} tool calls",
    you: "You",
    image: "Image",
    file: "File",
    part: "Text block {index}",
    messageText: "Message text",
    copy: "Copy",
    copied: "Copied",
    editAndResend: "Edit and resend",
    resend: "Resend",
    resendHint: "Send the original again in this conversation",
    retryTurn: "Retry turn",
    retryTurnHint: "Resend the message behind this answer in this conversation; the old answer stays",
    retryLastTurn: "Retry last turn",
    retryLastHint: "Resend the latest user message",
    retryStarted: "Resent. Generating a new answer.",
    sending: "Sending\u2026",
    sentAgain: "Resent",
    working: "Working\u2026",
    cancel: "Cancel",
    sendEdited: "Send",
    resendOriginal: "Resend",
    editHint: "{modifier}\u21B5 to send \xB7 Esc to cancel",
    editorNote: "Resends in this conversation; earlier messages and tool side effects are kept.",
    toolCallsWarning: "This message is followed by {count} tool calls. Resending does not revert them and may execute them again.",
    modelLine: "Current model \xB7 {model}",
    noModel: "No model selected",
    runningHint: "This conversation is generating; stop it before resending",
    pendingResume: "An unfinished edit draft is waiting",
    resume: "Continue editing",
    quoteSelection: "Quote selection",
    quoteHint: "Reply to this conversation with the selected text quoted",
    quotedSelection: "Quoting {count} characters",
    replyPlaceholder: "Reply to the selection\u2026",
    replySend: "Add to conversation",
    replySent: "Quoted reply added to this conversation.",
    backupIssue: "Background backup is incomplete: {code}. Sending re-verifies the backup first.",
    uncertain: "The last send is still uncertain. Resending is paused to avoid duplicates; check the result first.",
    checkResult: "Check",
    checkedSent: "Confirmed in this conversation",
    stillUncertain: "Still unconfirmed; check again later",
    error: "The action did not finish: {code}. Nothing was deleted from the conversation.",
    "errors.UNAVAILABLE": "The plugin or command service is not ready. Reinstall or restart dsh.",
    "errors.DISCONNECTED": "The connection dropped. Reconnect and check the result before retrying.",
    "errors.FORBIDDEN": "This conversation does not allow that action.",
    "errors.MESSAGE_NOT_FOUND": "The message does not exist or is not a user message.",
    "errors.BAD_MESSAGE_ID": "No user message matches this answer.",
    "errors.UNSUPPORTED_CONTENT": "The message contains content this plugin cannot replay losslessly.",
    "errors.SESSION_NOT_ACTIVE": "This conversation is not active. Return to it and try again.",
    "errors.SESSION_RUNNING": "This conversation is still generating. Stop it before resending.",
    "errors.PENDING_QUEUE": "This conversation has queued messages. Resolve the queue first.",
    "errors.STOP_TIMEOUT": "Stopping is still in progress. Wait for dsh to stop, then retry.",
    "errors.MODEL_CHANGED": "The model changed before sending. Confirm the current model and retry.",
    "errors.MODEL_NO_IMAGES": "The current model does not accept images. Choose an image-capable model.",
    "errors.OPEN_EDITOR_FIRST": "Open the editor before sending changed content.",
    "errors.DRAFT_CONFLICT": "The draft changed in another page. Reload it and try again.",
    "errors.REQUEST_CONFLICT": "This send request changed content. Submit it again.",
    "errors.EMPTY_MESSAGE": "A message needs text or an attachment.",
    "errors.EMPTY_REPLY": "The reply cannot be empty.",
    "errors.REPLY_TOO_LONG": "The reply is too long.",
    "errors.QUOTE_TOO_LONG": "The quoted selection is too long.",
    "errors.REQUEST_TOO_LARGE": "The request is too large.",
    "errors.BAD_REQUEST": "Invalid request.",
    "errors.BAD_ACTION": "Unsupported action.",
    "errors.BAD_SEQUENCE": "Invalid message position. Refresh and retry.",
    "errors.BAD_TOKEN": "Invalid operation token.",
    "errors.BAD_MODE": "Invalid send mode.",
    "errors.BAD_REQUEST_ID": "Invalid request id.",
    "errors.BAD_ROUTE": "Invalid model information.",
    "errors.INVALID_EDITS": "The edit does not match the message structure.",
    "errors.SOURCE_CHANGED": "The original message changed. Refresh and retry.",
    "errors.BACKUP_INVALID": "The local backup failed verification. Refresh and retry.",
    "errors.OPERATION_NOT_FOUND": "That send operation was not found.",
    "errors.NOT_EDITABLE": "That operation cannot be edited now.",
    "errors.RECOVERY_LOCKED": "Another recovery is in progress. Try again shortly.",
    "errors.NO_PERSISTENCE": "This deployment has no session persistence; sending was blocked.",
    "errors.STORAGE_UNAVAILABLE": "The local backup directory is not writable; sending was blocked.",
    "errors.SESSION_CHANGED": "The conversation changed. Refresh and retry.",
    "errors.SEND_UNCERTAIN": "The send result is uncertain. Check it before resending.",
    "errors.RECOVERY_FAILED": "Recovery failed. Try again shortly.",
    "errors.UNLOADED": "The plugin was unloaded. Restart dsh."
  }
};

// src/client/styles.js
var css = `
.dcr-tools{display:inline-flex;align-items:center;gap:2px;height:28px;flex:none}
.dcr-tool{width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-grid;place-items:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-tool:hover,.dcr-tool[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-tool:focus-visible,.dcr-icon-btn:focus-visible,.dcr-btn:focus-visible,.dcr-row:focus-visible,.dcr-native-action:focus-visible,.dcr-quick:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dcr-tool svg{width:17px;height:17px}

.dcr-msg{display:flex;flex-direction:column;align-items:flex-end;gap:1px;width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit}
.dcr-fallback{display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%)}
.dcr-fallback-bubble{padding:10px 16px;border-radius:var(--dsw-radius-xl,18px);background:var(--dsw-specific-bubble);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%}
.dcr-msg-actions{height:26px;display:flex;align-items:center;gap:1px;padding-right:1px;opacity:0;transition:opacity .12s ease}
.dcr-msg:hover .dcr-msg-actions,.dcr-msg:focus-within .dcr-msg-actions,.dcr-msg[data-busy=true] .dcr-msg-actions{opacity:1}
.dcr-msg-time{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:5px}
.dcr-icon-btn{width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dcr-icon-btn:disabled{opacity:.4;cursor:default}
.dcr-icon-btn svg{width:15px;height:15px}
.dcr-inline-error{margin:1px 0 0;max-width:100%;font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-error-primary);text-align:right;overflow-wrap:anywhere}
.dcr-msg-note{display:flex;align-items:center;gap:5px;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);text-align:right}
.dcr-msg-warning{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dcr-msg-warning .dcr-link{color:var(--dsw-alias-label-primary)}

.dcr-editor{box-sizing:border-box;width:min(560px,100%);max-width:100%;display:flex;flex-direction:column;gap:7px;padding:10px 12px 8px;border-radius:var(--dsw-radius-xl,18px);background:var(--dsw-specific-bubble);border:1px solid transparent;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));transition:border-color .12s ease}
.dcr-editor:focus-within{border-color:var(--dsw-alias-border-l3)}
.dcr-editor textarea{display:block;width:100%;min-height:44px;max-height:240px;resize:none;border:0;outline:none;background:transparent;color:inherit;font:inherit;line-height:inherit;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dcr-editor textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.dcr-editor-block{display:flex;flex-direction:column;gap:3px}
.dcr-editor-label{font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary)}
.dcr-editor-note{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.dcr-editor .dcr-inline-error{text-align:left}
.dcr-editor-warning{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary))!important}
.dcr-editor-panel{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);width:100%}
.dcr-editor-chips{display:flex;flex-wrap:wrap;gap:5px}
.dcr-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dcr-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcr-chip em{font-style:normal;color:var(--dsw-alias-label-tertiary);font-size:10.5px}
.dcr-editor-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.dcr-editor-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dcr-editor-actions{display:flex;align-items:center;gap:4px;margin-left:auto}
.dcr-btn{height:28px;padding:0 12px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:background .12s ease,color .12s ease,opacity .12s ease}
.dcr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-btn:disabled{opacity:.4;cursor:default}
.dcr-btn-primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.dcr-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover);color:#fff}
.dcr-btn-ghost{color:var(--dsw-alias-label-secondary)}
.dcr-link{border:0;background:none;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
.dcr-link:hover{color:var(--dsw-alias-label-primary)}
.dcr-spinner{width:13px;height:13px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:dcr-spin .7s linear infinite;opacity:.7;flex:none}
@keyframes dcr-spin{to{transform:rotate(360deg)}}

.dcr-native-action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-native-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dcr-native-action:disabled{opacity:.45;cursor:default}
.dcr-native-action svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px))}

.dcr-pop{position:absolute;right:0;bottom:calc(100% + 8px);z-index:100;box-sizing:border-box;width:min(540px,100%);max-height:min(62vh,520px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);animation:dcr-in .12s ease}
@keyframes dcr-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dcr-pop-head{display:flex;align-items:center;gap:4px;min-height:40px;padding:0 6px 0 10px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 65%,transparent);flex:none}
.dcr-pop-title{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcr-pop-head .dcr-icon-btn{color:var(--dsw-alias-label-tertiary)}
.dcr-pop-body{padding:8px 10px 10px;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1 1 auto}
.dcr-pop-scroll{flex:1 1 auto;overflow:auto;overscroll-behavior:contain;min-height:0;padding:3px 6px 6px}
.dcr-list{list-style:none;margin:0;padding:0}
.dcr-list li{margin:0}
.dcr-pop-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 65%,transparent);flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dcr-pop-empty{display:flex;flex-direction:column;align-items:center;gap:5px;padding:28px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dcr-pop-empty svg{opacity:.7}
.dcr-pop-empty strong{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dcr-pop-empty span{font-size:11.5px;line-height:17px;max-width:280px}
.dcr-pop-error{margin:0;padding:6px 10px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dcr-skeleton{display:flex;flex-direction:column;gap:7px;padding:8px 4px}
.dcr-skeleton span{display:block;height:34px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);animation:dcr-pulse 1.4s ease-in-out infinite}
.dcr-skeleton span:nth-child(2){width:88%;animation-delay:.12s}.dcr-skeleton span:nth-child(3){width:74%;animation-delay:.24s}
@keyframes dcr-pulse{0%,100%{opacity:.55}50%{opacity:1}}

.dcr-row{display:flex;align-items:center;gap:8px;width:100%;margin:1px 0;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background .12s ease}
.dcr-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dcr-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dcr-row-text{font-size:13px;line-height:19px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}
.dcr-row-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dcr-row-meta i{font-style:normal;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
.dcr-row-warn{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;font-size:10.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dcr-row-chevron{flex:none;color:var(--dsw-alias-label-quaternary);opacity:0;transition:opacity .12s ease}
.dcr-row:hover .dcr-row-chevron,.dcr-row:focus-visible .dcr-row-chevron{opacity:1}
.dcr-quick{display:flex;align-items:center;gap:8px;width:calc(100% - 12px);margin:2px 6px 4px;padding:7px 8px;border:0;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer;transition:background .12s ease,color .12s ease}
.dcr-quick:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dcr-quick:disabled{opacity:.5;cursor:default}
.dcr-quick svg{flex:none}
.dcr-quick span{flex:1;min-width:0}
.dcr-quick small{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;max-width:40%;overflow:hidden;text-overflow:ellipsis}
.dcr-banner{display:flex;align-items:center;gap:8px;margin:4px 6px 2px;padding:7px 9px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent);font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dcr-banner span{flex:1;min-width:0}
.dcr-banner .dcr-btn{height:24px;padding:0 9px;font-size:11.5px;flex:none}

.dcr-quote{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 3%,transparent);padding:7px 9px;margin-bottom:8px}
.dcr-quote-head{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-bottom:3px}
.dcr-quote-body{margin:0;max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overscroll-behavior:contain}
.dcr-model{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}

.dcr-toasts{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:1000;display:flex;flex-direction:column;align-items:center;gap:6px;max-width:min(92vw,540px);pointer-events:none}
.dcr-toast{pointer-events:auto;display:flex;align-items:center;gap:8px;max-width:100%;padding:7px 9px 7px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);animation:dcr-in .12s ease}
.dcr-toast span{min-width:0;overflow-wrap:anywhere}
.dcr-toast-error{color:var(--dsw-alias-state-error-primary)}
.dcr-toast button{width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;opacity:.6;cursor:pointer;flex:none;display:inline-grid;place-items:center}
.dcr-toast button:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover)}

@media(max-width:560px){
  .dcr-pop{left:0;width:100%;max-height:min(70vh,560px)}
  .dcr-editor{width:100%}
  .dcr-msg-actions{opacity:1}
  .dcr-toasts{bottom:76px}
}
@media(prefers-reduced-motion:reduce){.dcr-spinner{animation:none}.dcr-pop,.dcr-toast{animation:none}.dcr-msg-actions,.dcr-tool,.dcr-icon-btn,.dcr-btn,.dcr-row,.dcr-quick{transition:none}}
`;

// src/client/index.jsx
var NS = "dsh-content-rollback";
var QUOTE_LIMIT = 4e3;
var EDITOR_MAX_HEIGHT = 240;
var inject = ["slots", "locale", "remote", "remote.commands"];
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
function requestIdFor(ref, signature) {
  if (ref.current.signature === signature && ref.current.id) return ref.current.id;
  const id = newRequestId();
  ref.current = { id, signature };
  return id;
}
function resetRequestId(ref) {
  ref.current = { id: null, signature: null };
}
var Icon = ({ children, size = 16 }) => /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, children);
var HistoryIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 17 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 12a8 8 0 1 0 2.3-5.6M4 4.5V10h5.5", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 8v4.2l2.8 1.8", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var EditIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 15 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4.5 19.5h4l10-10-4-4-10 10v4Zm9-13 4 4", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var ResendIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 15 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4.5 11a7.5 7.5 0 1 1 2.2 5.3M4.5 5v6h6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var RetryIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 17 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4.5 11a7.5 7.5 0 1 1 2.2 5.3M4.5 5v6h6", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var CopyIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("rect", { x: "8.5", y: "8.5", width: "10", height: "10", rx: "2", stroke: "currentColor", strokeWidth: "1.6" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M15.5 8.5V6.8c0-1-.8-1.8-1.8-1.8H6.8c-1 0-1.8.8-1.8 1.8v6.9c0 1 .8 1.8 1.8 1.8h1.7", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }));
var CheckIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m5 12 4.5 4.5L19 7", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }));
var CloseIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 15 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m6 6 12 12M18 6 6 18", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round" }));
var BackIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 16 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M19 12H5m0 0 6-6m-6 6 6 6", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var ChevronIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "m9 6 6 6-6 6", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var RefreshIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 15 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5V10h-5.5", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }));
var QuoteIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 15 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M9 7H5v6h4c0 2-1 3-3 4M19 7h-4v6h4c0 2-1 3-3 4", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }));
var SendIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 13 }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 19V5m0 0-6 6m6-6 6 6", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" }));
var WarnIcon = () => /* @__PURE__ */ import_react.default.createElement(Icon, { size: 14 }, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "8.5", stroke: "currentColor", strokeWidth: "1.6" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 8v5m0 3h.01", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }));
var Spinner = () => /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-spinner", "aria-hidden": "true" });
function IconButton({ label, title, onClick, disabled, busy, children }) {
  return /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-icon-btn", "aria-label": label, title: title ?? label, disabled, onClick }, busy ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : children);
}
function ToolButton({ label, onClick, active, onPointerDown, children }) {
  return /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-tool", "aria-label": label, title: label, "aria-expanded": active || void 0, "data-dcr-trigger": "", onPointerDown, onClick }, children);
}
function timeText(time) {
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function whenText(time) {
  const date = new Date(time);
  const now = /* @__PURE__ */ new Date();
  if (date.toDateString() === now.toDateString()) return timeText(time);
  return date.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function prepareContent(content) {
  const texts = [];
  const attachments = [];
  const extraBlocks = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block?.type === "image" && block.attachment) attachments.push({ type: "image", image: { attachment: block.attachment } });
    else if (block?.type === "file" && block.attachment) attachments.push({ type: "file", file: block.attachment });
    else extraBlocks.push(block);
  }
  return { text: texts.join(""), attachments, extraBlocks };
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
      if (element?.closest?.('.dcr-chrome, [contenteditable="true"], textarea, input')) return;
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
  return selection;
}
var uiBySession = /* @__PURE__ */ new Map();
var uiListeners = /* @__PURE__ */ new Map();
function uiOf(sessionId) {
  return uiBySession.get(sessionId) ?? { open: false, quote: "" };
}
function updateUi(sessionId, patch) {
  uiBySession.set(sessionId, { ...uiOf(sessionId), ...patch });
  for (const listener of uiListeners.get(sessionId) ?? []) listener();
}
function useUi(sessionId) {
  const [value, setValue] = (0, import_react.useState)(() => uiOf(sessionId));
  const dispatch = (0, import_react.useCallback)((patch) => updateUi(sessionId, patch), [sessionId]);
  (0, import_react.useEffect)(() => {
    setValue(uiOf(sessionId));
    let listeners = uiListeners.get(sessionId);
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set();
      uiListeners.set(sessionId, listeners);
    }
    const listener = () => setValue(uiOf(sessionId));
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) uiListeners.delete(sessionId);
    };
  }, [sessionId]);
  return [value, dispatch];
}
var toastSeq = 0;
var toastItems = [];
var toastListeners = /* @__PURE__ */ new Set();
function removeToast(id) {
  toastItems = toastItems.filter((item) => item.id !== id);
  for (const listener of toastListeners) listener();
}
function pushToast(kind, text) {
  const item = { id: ++toastSeq, kind, text };
  toastItems = [...toastItems, item];
  for (const listener of toastListeners) listener();
  setTimeout(() => removeToast(item.id), kind === "error" ? 6e3 : 3200);
}
function ToastHost({ t }) {
  const [items, setItems] = (0, import_react.useState)(toastItems);
  (0, import_react.useEffect)(() => {
    const listener = () => setItems(toastItems);
    toastListeners.add(listener);
    return () => toastListeners.delete(listener);
  }, []);
  if (!items.length) return null;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-toasts" }, items.map((item) => /* @__PURE__ */ import_react.default.createElement("div", { key: item.id, className: `dcr-toast${item.kind === "error" ? " dcr-toast-error" : ""}`, role: item.kind === "error" ? "alert" : "status" }, /* @__PURE__ */ import_react.default.createElement("span", null, item.text), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-label": t("close"), onClick: () => removeToast(item.id) }, /* @__PURE__ */ import_react.default.createElement(CloseIcon, null)))));
}
function AutoTextarea({ value, onChange, onKeyDown, label, placeholder, autoFocus }) {
  const ref = (0, import_react.useRef)(null);
  (0, import_react.useLayoutEffect)(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(Math.max(element.scrollHeight, 44), EDITOR_MAX_HEIGHT)}px`;
  }, [value]);
  (0, import_react.useEffect)(() => {
    if (!autoFocus) return;
    const element = ref.current;
    if (element) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [autoFocus]);
  return /* @__PURE__ */ import_react.default.createElement("textarea", { ref, rows: 1, value, "aria-label": label, placeholder, onChange, onKeyDown, spellCheck: false });
}
function MessageEditor({ content, facts, loadImage, renderFactorySlot, t, busy, error, warning, onCancel, onSend, model, variant = "inline" }) {
  const textBlocks = (0, import_react.useMemo)(() => content.filter((part) => part.type === "text"), [content]);
  const attachmentCount = content.filter((part) => part.type !== "text").length;
  const [edits, setEdits] = (0, import_react.useState)(() => textBlocks.map((part) => part.text));
  const preview = (0, import_react.useMemo)(() => ({ ...prepareContent(content), text: "" }), [content]);
  const canSend = !busy && (edits.some((text) => text.trim()) || attachmentCount > 0);
  const send = () => {
    if (!canSend) return;
    onSend(textBlocks.length === 0 ? void 0 : edits);
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      send();
    }
  };
  const nativePreview = renderFactorySlot && loadImage ? renderFactorySlot("conversation.chat.user.content", { content: preview, loadImage, facts: facts ?? {}, interactive: false }) : null;
  const previewChips = !nativePreview && content.some((part) => part.type !== "text") ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor-chips" }, content.filter((part) => part.type !== "text").map((part, index) => /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-chip", key: index }, /* @__PURE__ */ import_react.default.createElement("span", null, part.attachment?.name || t(part.type === "image" ? "image" : "file")), part.attachment?.bytes !== void 0 && /* @__PURE__ */ import_react.default.createElement("em", null, part.attachment.bytes, " B")))) : null;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: `dcr-editor${variant === "panel" ? " dcr-editor-panel" : ""}`, onKeyDown }, nativePreview ?? previewChips, textBlocks.length === 0 ? /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-editor-note" }, t("attachmentOnly")) : edits.map((value, index) => /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor-block", key: index }, edits.length > 1 && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-editor-label" }, t("part", { index: index + 1 })), /* @__PURE__ */ import_react.default.createElement(AutoTextarea, { value, label: edits.length > 1 ? t("part", { index: index + 1 }) : t("messageText"), autoFocus: index === 0, onChange: (event) => setEdits((previous) => previous.map((item, position) => position === index ? event.target.value : item)), onKeyDown }))), warning && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-editor-note dcr-editor-warning" }, warning), variant === "panel" && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-editor-note" }, t("editorNote")), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-inline-error", role: "alert" }, errorText(t, error)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor-foot" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-editor-hint" }, busy ? t("working") : t("editHint", { modifier: PRIMARY_MODIFIER })), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-editor-actions" }, variant === "panel" && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-model" }, model ? t("modelLine", { model }) : t("noModel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-btn dcr-btn-ghost", disabled: busy, onClick: onCancel }, t("cancel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-btn dcr-btn-primary", title: t("editorNote"), disabled: !canSend, onClick: send }, busy ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : textBlocks.length === 0 ? null : /* @__PURE__ */ import_react.default.createElement(SendIcon, null), t(textBlocks.length === 0 ? "resendOriginal" : "sendEdited")))));
}
function UserMessageNode({ node, loadImage, renderFactorySlot, sessionId, remote, t }) {
  const data = node.data;
  const content = data.content;
  const prepared = (0, import_react.useMemo)(() => {
    const value = prepareContent(content);
    if (Array.isArray(data.referenceLabels) && data.referenceLabels.length) value.referenceLabels = data.referenceLabels;
    return value;
  }, [content, data.referenceLabels]);
  const facts = (0, import_react.useMemo)(() => ({
    ...Array.isArray(data.referenceLabels) && data.referenceLabels.length ? { sessionLabels: data.referenceLabels } : {},
    ...Array.isArray(data.skillNames) && data.skillNames.length ? { skillNames: data.skillNames } : {}
  }), [data.referenceLabels, data.skillNames]);
  const textBlocks = prepared.text;
  const textCount = content.filter((part) => part.type === "text").length;
  const canEdit = textCount > 0;
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [uncertain, setUncertain] = (0, import_react.useState)(null);
  const [copied, setCopied] = (0, import_react.useState)(false);
  const [impact, setImpact] = (0, import_react.useState)(null);
  const requestRef = (0, import_react.useRef)({ id: null, signature: null });
  const active = (0, import_react.useRef)(true);
  const timer = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  (0, import_react.useEffect)(() => {
    if (!notice) return;
    timer.current = setTimeout(() => {
      if (active.current) setNotice(null);
    }, 3200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [notice]);
  const request = (value) => callRecovery(typeof fetch === "function" ? fetch.bind(globalThis) : null, remote, sessionId, value);
  (0, import_react.useEffect)(() => {
    if (!editing) {
      setImpact(null);
      return;
    }
    let alive = true;
    setImpact(null);
    void request({ action: "inspect", seq: data.seq }).then((result) => {
      if (alive && active.current) setImpact(result);
    }, () => {
    });
    return () => {
      alive = false;
    };
  }, [editing, data.seq]);
  const rendered = renderFactorySlot ? renderFactorySlot("conversation.chat.user.content", { content: prepared, loadImage, facts, interactive: true }) : null;
  const native = rendered ?? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-fallback" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-fallback-bubble" }, prepared.text || t("attachmentOnly")), prepared.attachments.length > 0 && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor-chips" }, prepared.attachments.map((part, index) => /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-chip", key: index }, /* @__PURE__ */ import_react.default.createElement("span", null, part.image?.attachment?.name || part.file?.name || t("file"))))));
  async function send(edits) {
    if (busy || uncertain) return;
    const signature = JSON.stringify(edits ?? null);
    const requestId = requestIdFor(requestRef, signature);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request({ action: "resend", seq: data.seq, requestId, ...edits === void 0 ? {} : { edits } });
      if (!active.current) return;
      if (result.state === "accepted") {
        resetRequestId(requestRef);
        setEditing(false);
        setNotice(t("sentAgain"));
        updateUi(sessionId, { open: false, quote: "" });
      } else if (result.state === "uncertain") {
        resetRequestId(requestRef);
        setEditing(false);
        setUncertain(result.token);
      } else {
        setError(result.error ?? "RECOVERY_FAILED");
      }
    } catch (cause) {
      if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function check() {
    if (!uncertain || busy) return;
    setBusy(true);
    try {
      const result = await request({ action: "status", token: uncertain });
      if (!active.current) return;
      if (result.state === "accepted") {
        setUncertain(null);
        setNotice(t("checkedSent"));
      } else setNotice(t("stillUncertain"));
    } catch (cause) {
      if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function copy() {
    if (!textBlocks) return;
    try {
      await navigator.clipboard.writeText(textBlocks);
      if (active.current) {
        setCopied(true);
        setTimeout(() => {
          if (active.current) setCopied(false);
        }, 1200);
      }
    } catch {
    }
  }
  if (editing) {
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-msg", "data-dcr-seq": data.seq }, /* @__PURE__ */ import_react.default.createElement(MessageEditor, { content, facts, loadImage, renderFactorySlot, t, busy, error, warning: impact?.toolCalls > 0 ? t("toolCallsWarning", { count: impact.toolCalls }) : null, onCancel: () => {
      setEditing(false);
      setError(null);
    }, onSend: send }));
  }
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-msg", "data-dcr-seq": data.seq, "data-busy": busy || void 0 }, native, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-msg-actions" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-msg-time" }, data.time ? timeText(data.time) : ""), canEdit && /* @__PURE__ */ import_react.default.createElement(IconButton, { label: t("editAndResend"), disabled: busy || Boolean(uncertain), onClick: () => {
    setEditing(true);
    setError(null);
    setNotice(null);
  } }, /* @__PURE__ */ import_react.default.createElement(EditIcon, null)), /* @__PURE__ */ import_react.default.createElement(IconButton, { label: t("resendHint"), disabled: busy || Boolean(uncertain), busy, onClick: () => void send(void 0) }, /* @__PURE__ */ import_react.default.createElement(ResendIcon, null)), textBlocks && /* @__PURE__ */ import_react.default.createElement(IconButton, { label: copied ? t("copied") : t("copy"), onClick: () => void copy() }, copied ? /* @__PURE__ */ import_react.default.createElement(CheckIcon, null) : /* @__PURE__ */ import_react.default.createElement(CopyIcon, null))), notice && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-msg-note" }, /* @__PURE__ */ import_react.default.createElement(CheckIcon, null), notice), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-inline-error", role: "alert" }, errorText(t, error)), uncertain && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-msg-warning" }, /* @__PURE__ */ import_react.default.createElement(WarnIcon, null), t("uncertain"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-link", disabled: busy, onClick: () => void check() }, t("checkResult"))));
}
function RetryTurnAction({ messageId, sessionId, remote, t }) {
  const [busy, setBusy] = (0, import_react.useState)(false);
  const requestRef = (0, import_react.useRef)({ id: null, signature: null });
  async function retry() {
    if (busy) return;
    const requestId = requestIdFor(requestRef, messageId);
    setBusy(true);
    try {
      const request = (value) => callRecovery(typeof fetch === "function" ? fetch.bind(globalThis) : null, remote, sessionId, value);
      const result = await request({ action: "retry-turn", messageId, requestId });
      if (result.state === "accepted") {
        resetRequestId(requestRef);
        pushToast("success", t("retryStarted"));
      } else if (result.state === "uncertain") {
        resetRequestId(requestRef);
        pushToast("error", t("errors.SEND_UNCERTAIN"));
      } else pushToast("error", errorText(t, result.error ?? "RECOVERY_FAILED"));
    } catch (cause) {
      pushToast("error", errorText(t, cause.code ?? "RECOVERY_FAILED"));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-native-action", "aria-label": t("retryTurn"), title: t("retryTurnHint"), disabled: busy, onClick: () => void retry() }, busy ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : /* @__PURE__ */ import_react.default.createElement(RetryIcon, null));
}
function ComposerTools({ sessionId, t }) {
  const [ui, setUi] = useUi(sessionId);
  const selection = useSelection();
  return /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-tools dcr-chrome" }, selection && /* @__PURE__ */ import_react.default.createElement(ToolButton, { label: t("quoteHint"), onPointerDown: (event) => event.preventDefault(), onClick: () => setUi({ open: true, quote: selection }) }, /* @__PURE__ */ import_react.default.createElement(QuoteIcon, null)), /* @__PURE__ */ import_react.default.createElement(ToolButton, { label: t("historyHint"), active: ui.open, onClick: () => setUi(ui.open ? { open: false, quote: "" } : { open: true, quote: "" }) }, /* @__PURE__ */ import_react.default.createElement(HistoryIcon, null)));
}
function QuoteEditor({ quote, sessionId, remote, t, onDone, onCancel }) {
  const [text, setText] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const requestRef = (0, import_react.useRef)({ id: null, signature: null });
  const canSend = !busy && Boolean(text.trim());
  async function send() {
    if (!canSend) return;
    const requestId = requestIdFor(requestRef, text);
    setBusy(true);
    setError(null);
    try {
      await callRecovery(typeof fetch === "function" ? fetch.bind(globalThis) : null, remote, sessionId, { action: "reply", text, quote, requestId });
      resetRequestId(requestRef);
      onDone();
    } catch (cause) {
      setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      void send();
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-body", onKeyDown }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor dcr-editor-panel" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-quote" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-quote-head" }, /* @__PURE__ */ import_react.default.createElement(QuoteIcon, null), t("quotedSelection", { count: quote.length })), /* @__PURE__ */ import_react.default.createElement("blockquote", { className: "dcr-quote-body" }, quote)), /* @__PURE__ */ import_react.default.createElement(AutoTextarea, { value: text, label: t("replyPlaceholder"), placeholder: t("replyPlaceholder"), autoFocus: true, onChange: (event) => setText(event.target.value), onKeyDown }), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-inline-error", role: "alert" }, errorText(t, error)), /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-editor-foot" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-editor-hint" }, busy ? t("working") : t("editHint", { modifier: PRIMARY_MODIFIER })), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-editor-actions" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-btn dcr-btn-ghost", disabled: busy, onClick: onCancel }, t("cancel")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-btn dcr-btn-primary", disabled: !canSend, onClick: () => void send() }, busy ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : /* @__PURE__ */ import_react.default.createElement(SendIcon, null), t("replySend"))))));
}
function RecoveryPanel({ sessionId, t, remote }) {
  const [ui, setUi] = useUi(sessionId);
  const [data, setData] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [view, setView] = (0, import_react.useState)("list");
  const [selected, setSelected] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [reload, setReload] = (0, import_react.useState)(0);
  const root = (0, import_react.useRef)(null);
  const active = (0, import_react.useRef)(true);
  const loadTicket = (0, import_react.useRef)(0);
  const detailTicket = (0, import_react.useRef)(0);
  const panelRequest = (0, import_react.useRef)({ id: null, signature: null });
  const retryRequest = (0, import_react.useRef)({ id: null, signature: null });
  const request = (value) => callRecovery(typeof fetch === "function" ? fetch.bind(globalThis) : null, remote, sessionId, value);
  (0, import_react.useEffect)(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    loadTicket.current++;
    detailTicket.current++;
    setData(null);
    setView("list");
    setSelected(null);
    setError(null);
    setBusy(false);
  }, [sessionId]);
  (0, import_react.useEffect)(() => {
    if (!ui.open) {
      setView("list");
      setSelected(null);
      setError(null);
      setData(null);
    }
  }, [ui.open]);
  (0, import_react.useEffect)(() => {
    if (!ui.open || ui.quote) return;
    void load(false);
  }, [ui.open, ui.quote, reload]);
  (0, import_react.useEffect)(() => {
    if (!ui.open) return;
    const onPointerDown = (event) => {
      if (root.current?.contains(event.target) || event.target.closest?.("[data-dcr-trigger]")) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ui.open, setUi]);
  async function load(more) {
    const ticket = ++loadTicket.current;
    if (!more) {
      setLoading(true);
      setError(null);
    }
    try {
      const previous = more ? data?.items ?? [] : [];
      const before = more && previous.length ? { before: previous.at(-1).seq } : {};
      const result = await request({ action: "list", ...before });
      if (!active.current || ticket !== loadTicket.current) return;
      setData(more ? { ...result, items: [...previous, ...result.items] } : result);
    } catch (cause) {
      if (active.current && ticket === loadTicket.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current && ticket === loadTicket.current) setLoading(false);
    }
  }
  function close() {
    loadTicket.current++;
    detailTicket.current++;
    setUi({ open: false, quote: "" });
  }
  async function openItem(item) {
    const ticket = ++detailTicket.current;
    setView("edit");
    setSelected({ seq: item.seq, loading: true });
    setError(null);
    try {
      const result = await request({ action: "inspect", seq: item.seq });
      if (active.current && ticket === detailTicket.current) setSelected(result);
    } catch (cause) {
      if (active.current && ticket === detailTicket.current) {
        setSelected(null);
        setView("list");
        pushToast("error", errorText(t, cause.code ?? "RECOVERY_FAILED"));
      }
    }
  }
  function back() {
    detailTicket.current++;
    setView("list");
    setSelected(null);
    setError(null);
  }
  async function resume() {
    if (!data?.pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request({ action: "load-draft", token: data.pending.token });
      if (active.current) {
        setSelected(result);
        setView("edit");
      }
    } catch (cause) {
      if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function retryLast() {
    if (data?.lastUserSeq === null || data?.lastUserSeq === void 0 || busy) return;
    const requestId = requestIdFor(retryRequest, `seq:${data.lastUserSeq}`);
    setBusy(true);
    try {
      const result = await request({ action: "resend", seq: data.lastUserSeq, requestId });
      if (!active.current) return;
      if (result.state === "accepted") {
        resetRequestId(retryRequest);
        pushToast("success", t("retryStarted"));
        setReload((value) => value + 1);
      } else if (result.state === "uncertain") {
        resetRequestId(retryRequest);
        setError("SEND_UNCERTAIN");
      } else setError(result.error ?? "RECOVERY_FAILED");
    } catch (cause) {
      if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function sendFromPanel(edits) {
    if (!selected || busy) return;
    const signature = JSON.stringify(edits ?? null);
    const requestId = requestIdFor(panelRequest, signature);
    setBusy(true);
    setError(null);
    try {
      const result = await request({ action: "resend", seq: selected.seq, requestId, ...edits === void 0 ? {} : { edits } });
      if (!active.current) return;
      if (result.state === "accepted") {
        resetRequestId(panelRequest);
        pushToast("success", t("sentAgain"));
        back();
        setReload((value) => value + 1);
      } else if (result.state === "uncertain") {
        resetRequestId(panelRequest);
        setError("SEND_UNCERTAIN");
      } else {
        setError(result.error ?? "RECOVERY_FAILED");
      }
    } catch (cause) {
      if (active.current) setError(cause.code ?? "RECOVERY_FAILED");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  if (!ui.open) return null;
  const title = ui.quote ? t("quoteSelection") : view === "edit" ? t("editTitle") : t("historyTitle");
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop dcr-chrome", role: "dialog", "aria-label": title, ref: root }, /* @__PURE__ */ import_react.default.createElement("header", { className: "dcr-pop-head" }, !ui.quote && view === "edit" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-icon-btn", "aria-label": t("back"), onClick: back }, /* @__PURE__ */ import_react.default.createElement(BackIcon, null)), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-pop-title" }, title), !ui.quote && view === "list" && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-icon-btn", "aria-label": t("refresh"), title: t("refresh"), disabled: loading, onClick: () => void load(false) }, loading ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : /* @__PURE__ */ import_react.default.createElement(RefreshIcon, null)), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-icon-btn", "aria-label": t("close"), title: t("close"), onClick: close }, /* @__PURE__ */ import_react.default.createElement(CloseIcon, null))), ui.quote ? /* @__PURE__ */ import_react.default.createElement(QuoteEditor, { quote: ui.quote, sessionId, remote, t, onCancel: () => setUi({ quote: "" }), onDone: () => {
    setUi({ open: false, quote: "" });
    pushToast("success", t("replySent"));
  } }) : view === "list" ? /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-scroll" }, error && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-pop-error", role: "alert" }, errorText(t, error)), data?.archiveIssue && /* @__PURE__ */ import_react.default.createElement("p", { className: "dcr-pop-error", role: "status" }, t("backupIssue", { code: data.archiveIssue })), data?.lastUserSeq !== null && data?.lastUserSeq !== void 0 && /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-quick", disabled: busy || data.activity?.running, onClick: () => void retryLast(), title: data.activity?.running ? t("runningHint") : t("retryLastHint") }, busy ? /* @__PURE__ */ import_react.default.createElement(Spinner, null) : /* @__PURE__ */ import_react.default.createElement(RetryIcon, null), /* @__PURE__ */ import_react.default.createElement("span", null, t("retryLastTurn")), /* @__PURE__ */ import_react.default.createElement("small", null, data.route?.model ?? "")), data?.pending && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-banner" }, /* @__PURE__ */ import_react.default.createElement("span", null, t("pendingResume")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-btn", disabled: busy, onClick: () => void resume() }, t("resume"))), !data && loading && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-skeleton" }, /* @__PURE__ */ import_react.default.createElement("span", null), /* @__PURE__ */ import_react.default.createElement("span", null), /* @__PURE__ */ import_react.default.createElement("span", null)), data && data.items.length === 0 && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-empty" }, /* @__PURE__ */ import_react.default.createElement(HistoryIcon, null), /* @__PURE__ */ import_react.default.createElement("strong", null, t("empty")), /* @__PURE__ */ import_react.default.createElement("span", null, t("emptyHint"))), data && data.items.length > 0 && /* @__PURE__ */ import_react.default.createElement("ol", { className: "dcr-list" }, data.items.map((item) => /* @__PURE__ */ import_react.default.createElement("li", { key: item.seq }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-row", onClick: () => void openItem(item) }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-row-main" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-row-text" }, item.preview || t("attachmentOnly")), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-row-meta" }, /* @__PURE__ */ import_react.default.createElement("time", null, whenText(item.time)), /* @__PURE__ */ import_react.default.createElement("span", null, "#", item.seq), item.toolCalls > 0 && /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-row-warn" }, t("toolChip", { count: item.toolCalls })), item.attachments.map((part, index) => /* @__PURE__ */ import_react.default.createElement("i", { key: index }, part.name || t(part.type === "image" ? "image" : "file"))))), /* @__PURE__ */ import_react.default.createElement("span", { className: "dcr-row-chevron" }, /* @__PURE__ */ import_react.default.createElement(ChevronIcon, null)))))), data?.hasMore && /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-body" }, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "dcr-link", disabled: loading, onClick: () => void load(true) }, loading ? t("loading") : t("more")))), /* @__PURE__ */ import_react.default.createElement("footer", { className: "dcr-pop-foot" }, /* @__PURE__ */ import_react.default.createElement("span", null, data?.activity?.running ? t("runningHint") : t("historyHint")))) : /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-body" }, selected?.loading ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-skeleton" }, /* @__PURE__ */ import_react.default.createElement("span", null), /* @__PURE__ */ import_react.default.createElement("span", null), /* @__PURE__ */ import_react.default.createElement("span", null)) : selected ? /* @__PURE__ */ import_react.default.createElement(MessageEditor, { key: selected.seq, content: selected.content ?? selected.originalContent ?? [], facts: {}, t, busy, error, warning: selected.toolCalls > 0 ? t("toolCallsWarning", { count: selected.toolCalls }) : null, model: selected.route?.model ?? data?.route?.model, variant: "panel", onCancel: back, onSend: sendFromPanel }) : /* @__PURE__ */ import_react.default.createElement("div", { className: "dcr-pop-empty" }, /* @__PURE__ */ import_react.default.createElement("strong", null, t("empty")))));
}
function ensureStyles() {
  if (typeof document === "undefined") return;
  let element = document.querySelector("style[data-dcr-styles]");
  if (!element) {
    element = document.createElement("style");
    element.dataset.dcrStyles = "";
    document.head.appendChild(element);
  }
  if (element.textContent !== css) element.textContent = css;
}
function apply(ctx) {
  ensureStyles();
  ctx.effect(() => ctx.locale.register(NS, translations));
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register(
    { name: "conversation.chat.node", key: "user", locale: NS },
    (props) => /* @__PURE__ */ import_react.default.createElement(UserMessageNode, { ...props, remote: ctx.remote })
  ));
  ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register(
    { name: "conversation.chat.assistant-actions", id: "content-rollback.retry", order: 10, locale: NS },
    (props) => /* @__PURE__ */ import_react.default.createElement(RetryTurnAction, { ...props, remote: ctx.remote })
  ));
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
    { name: "conversation.input.left", id: "content-rollback.history", order: 10, locale: NS },
    (props) => /* @__PURE__ */ import_react.default.createElement(ComposerTools, { ...props })
  ));
  ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register(
    { name: "conversation.input.overlay", id: "content-rollback.panel", order: 10, locale: NS },
    (props) => /* @__PURE__ */ import_react.default.createElement(RecoveryPanel, { ...props, remote: ctx.remote })
  ));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register(
    { name: "shell.overlay", id: "content-rollback.toasts", order: 100, locale: NS },
    (props) => /* @__PURE__ */ import_react.default.createElement(ToastHost, { ...props })
  ));
}

return module.exports;}});
