# dsh-content-rollback · 对话回溯

[![CI](https://github.com/github-llh/dsh-content-rollback/actions/workflows/ci.yml/badge.svg)](https://github.com/github-llh/dsh-content-rollback/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/dsh-0.2.1--rc.2-426B65)](https://deepseek-harness.github.io/deepseek-harness/)

在**同一个 DSH 会话**里直接编辑、重发和重试已经发出的内容：鼠标移到任意用户消息上即可编辑并重发，助手回答旁可以重试本轮，输入框工具行里的历史浮层可以找回较早的消息。文字、图片、文件与视频引用都会保留；备份写入本机，断线、双击、切工作区都不会造成重复发送或串会话。

> 关键边界：DSH 的会话日志是只追加的，当前宿主没有“删除已发消息并同步刷新原生聊天记录”的公开接口。本插件因此**不会**把旧消息从对话里抹掉，也不会撤销工具对文件或外部系统的修改。它做的是“在当前会话内安全地再发一次”。

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [能力](#能力)
- [明确不做什么](#明确不做什么)
- [安装](#安装)
- [使用](#使用)
- [交互与快捷键](#交互与快捷键)
- [安全机制](#安全机制)
- [本地存储](#本地存储)
- [架构](#架构)
- [开发与测试](#开发与测试)
- [发布自动化](#发布自动化)
- [兼容性](#兼容性)
- [English quick start](#english-quick-start)
- [License](#license)

## 它解决什么问题

DSH 发出消息后，原生界面只支持继续对话，不能把某条已发消息“拿回来改一改再发”。真正让人难受的不是不能改，而是**内容丢了**：长文本、多张图、视频、文件、精心组织的段落，一旦要重来就得重新找、重新传。

本插件从 DSH 的事件日志中读取**已经持久化的原始消息**，把每个图片/文件块按 DSH 的附件服务读成字节并做 SHA-256 校验，存到本机保险库；之后可以在原会话里：

- 原样再发一次；
- 取回文字编辑后发送，附件保持原有顺序和已发送版本；
- 选中对话中的任意文本，带着引用写一条回复。

编辑重发与重试都是**撤回式**的：旧消息和它之后的全部回合从模型可见历史中撤回，编辑后的内容落在原位置，模型看到的对话就像“这条消息本来就是编辑后的版本”。原生转录保持只追加、不被改写，旧内容仍然可见可查。

## 能力

| 能力 | 说明 |
|---|---|
| 就地编辑重发 | 悬停任意用户消息 → 铅笔图标 → 在原气泡位置编辑 → 发送；不再跳到独立面板 |
| 撤回式重发 | 旧消息与其后回合从模型可见历史撤回，编辑后的内容落在原位置；不在会话末尾堆积副本，不新建会话 |
| 原样重发 | 内容块逐字节/逐字段还原，包含图片、文件、视频引用与未知元数据 |
| 重试本轮 | 完成回答旁的重试图标会重新发送该回答对应的用户消息；旧回答从模型历史撤回，转录中保留 |
| 重试最近一轮 | 输入框工具行的历史浮层一键重发最新用户消息，失败回合也能重试 |
| 历史找回 | 紧凑浮层列出最近 30 条用户消息，可继续编辑或原样重发较早的内容 |
| 引用回复 | 选中对话文本 → 选区上方浮出“回复”→ 引用卡片 → 添加到当前会话；已发送的引用消息带引用卡片 |
| 撤回标记 | 被撤回的消息带“已撤回”徽标并置灰；刷新后仍然有效（标记随操作落盘） |
| 字节级备份 | 图片与文件按 SHA-256 去重；读取时校验长度与摘要；宿主对象丢失时可用备份重建 |
| 会话隔离 | 操作绑定确切 sessionId；切会话后旧操作不可被调用 |
| 模型校验 | 发送前按当前会话模型校验内容（例如图片模态）；发送路由记录在操作中 |
| 幂等发送 | 客户端 requestId 即操作 token；断线重试只会核对，不会重复入队 |
| 不确定态保护 | 已入队但未确认落盘时进入 `uncertain`，绝不自动重发 |
| 未完成草稿 | 旧版本或工具调用留下的未完成草稿会显示在历史浮层，可继续编辑 |
| 隐私 | 不访问外部网络；界面只调用本机 DSH 同源路由。备份只在本机 `$DSH_HOME` 下，权限 `0700/0600` |

## 明确不做什么

1. **不改写原生转录**。DSH 的事件日志只追加：旧消息、旧回复始终留在会话里可见可查。插件只改变**模型可见历史**——用一条 surface 替换事件把旧消息和它之后的回合屏蔽掉，编辑后的内容落在原位置。被撤回的消息会置灰并标注“已撤回”，但记录本身不被删除。
2. **不撤销副作用**。工具改过的文件、执行过的命令、调用的外部服务不会回滚。重发可能让工具再次执行；历史浮层会标出该消息之后的工具调用数；编辑卡片或发送按钮的提示会说明旧消息与工具副作用会保留。
3. **不新建会话、不分支**。编辑重发、重试、引用回复都发生在当前会话内；没有 fork、跳转或“在旁边开一个新对话”。
4. **不恢复“上传前原图”**。DSH 在写入前会做规范化（压缩、去元数据、动画只留首帧），插件保存的是**已经发出去的那个版本**。
5. **不保证视频可被模型解析**。视频按普通文件字节保存与重发，模型是否支持取决于所选模型。
6. **不复制 `@路径` 指向的文件**。路径引用只是文字；原文件变化后无法还原。
7. **不跨机器同步**。备份没有云端，也不会自动清理；需要时可手动删除存储目录。
8. **不接管 DSH 输入框**。编辑发生在消息气泡内，引用回复在输入框上方的浮层内完成，不会覆盖你正在写的 composer 草稿。
9. **重发依赖会话持久化**。默认 DSH 组合自带 JSONL 持久化；如果部署移除了持久化后端，插件会以 `NO_PERSISTENCE` 拒绝发送，而不是假装成功。备份目录不可写时插件仍会加载，并返回 `STORAGE_UNAVAILABLE`，不会阻塞整个 DSH 启动。
10. **不追加重发副本**。撤回发生后，如果会话在这条消息之后又有了新内容（用户在发送途中继续说话），插件以 `RETRACT_STALE` 拒绝，而不是把新消息一起撤回。

## 安装

要求：DSH `0.2.1-rc.2`（`>=0.2.1-rc.2 <0.3.0`）、Node `>=22.19.0`。

按 DSH 官方插件规范，使用 `plugin_manager` 的 `install_bundle` 安装，**不要**手写 profile 的 `package.json` 或 `cordis.patch.yml`：

1. 将本仓库放到一个工作区目录（例如 `~/company/sy/plugin/dsh-content-rollback`）。
2. 在 DSH 会话中让 Agent 执行 `plugin_manager` → `install_bundle`，`target` 指向该目录的绝对路径。
3. 读取返回的 `application` 与 `warnings`；替换已安装的同名包通常需要重启 DSH。
4. 打开任意会话：输入框工具行会出现历史图标；把鼠标移到已发送的用户消息上会出现编辑、重发与复制动作。

安装后的插件行由 `cordis.patch.yml` 插入，配置为空对象，无需手工调参。

## 使用

### 在消息上直接编辑与重发

1. 把鼠标移到任意已发送的用户消息上，气泡下方出现 **编辑**、**重发** 与 **复制**；
2. 点 **编辑**：原气泡位置展开编辑卡片，文字块自动增高、首段自动聚焦；发送时图片和文件保持原顺序与原版本，编辑器里只读展示；
3. `⌘/Ctrl + Enter` 发送，`Esc` 取消；发送成功后卡片收起，原消息置灰并标注“已撤回”，新回答从原位置继续；
4. 点 **重发**：不改文字，直接把原始内容（含附件）按同样方式撤回重发。

> 撤回的是**模型可见历史**，不是转录：旧消息和旧回答仍然留在对话记录里（置灰 + “已撤回”徽标），但模型再从这条消息往下看时，看到的就是你编辑后的版本。工具副作用不会被撤销。

### 重试回答

- 每条完成回答的动作行新增 **重试本轮**：找到该回答对应的用户消息，在当前会话重新发送一次；
- 输入框工具行的历史浮层顶部提供 **重试最近一轮**，失败的回答回合也能重试；
- 任一用户消息的 **重发** 都等价于“从这条消息继续”，用于从更早的位置重新发起一轮。

> 重试会把这轮旧回答从模型可见历史中撤回（转录保留），新回答直接在原位置之后生成，不会出现“旧回答 + 新回答”两条并存的上下文。

### 历史浮层与引用

1. 点击输入框工具行的历史图标，打开紧凑浮层；
2. 浮层列出最近 30 条用户消息，可继续编辑、原样重发或加载更早消息；
3. 在对话中选中一段文字（插件界面或输入框内的选择会被忽略），**选区上方会浮出“回复”按钮**，工具行也会出现引用按钮；
4. 点击任一入口，在浮层里写回复；`⌘/Ctrl + Enter` 或 **添加到当前会话**。

引用会以 `>` 前缀作为独立文本块，并以空行与回复正文分开。选择上限 4000 字符，回复上限 16000 字符。已发送的引用回复在对话里渲染为**引用卡片 + 正文**（卡片内容与模型读到的引用一致）。

### 命令与 Agent 工具

`/rollback` 接受 JSON 请求，便于脚本或 Agent 调用：

```text
/rollback {"action":"list"}
/rollback {"action":"inspect","seq":42}
/rollback {"action":"resend","seq":42,"requestId":"<uuid>"}
/rollback {"action":"resend","seq":42,"requestId":"<uuid>","edits":["修改后的文字"]}
/rollback {"action":"retry-turn","messageId":"<assistant-message-id>","requestId":"<uuid>"}
/rollback {"action":"reply","text":"补充说明","quote":"被引用的句子","requestId":"<uuid>"}
/rollback {"action":"marks"}
```

`marks` 返回当前会话中已被撤回的消息序号与模式，供界面渲染“已撤回”徽标。

Agent 侧工具名为 `conversation_recovery`，参数与命令一致。工具不会在用户未要求时主动执行恢复。

## 交互与快捷键

- 全部界面使用宿主主题变量（`--dsw-alias-*`），自动适配浅色/深色；弹层与编辑卡片不写死颜色。
- 用户消息动作默认只在悬停或键盘聚焦时出现；触屏设备常显。
- `Esc` 取消内联编辑或关闭浮层；`⌘/Ctrl + Enter` 发送编辑或引用回复。
- 发送成功、发送不确定与失败通过 `role="status"` / `role="alert"` 播报；复制有图标反馈。
- 遵循 `prefers-reduced-motion`；窄屏下浮层占满输入区宽度。
- 不写 `document.body`、不读取其他插件 DOM；只读取浏览器当前选区文本，并忽略输入框与插件界面内的选择。

## 安全机制

发送链路按顺序执行，任一步失败都不会产生“偷偷重发”：

1. 读取会话日志，确认目标消息指纹未变化；
2. 校验本地备份的每个对象（长度 + SHA-256），必要时用备份重建宿主附件并复核；
3. 复核模型与内容（图片模态等），任何校验失败都发生在停顿时检查之前；
4. 停顿时检查：会话空闲、队列为空；界面不会自动停止生成，命令/工具只有在明确要求时才传 `stop=true`（保留排队输入）；
5. 计算撤回区间（目标消息 → 当前模型可见历史的末尾），并要求请求时捕获的区间仍然完整——期间出现新消息则拒绝（`RETRACT_STALE`），绝不把新消息一起撤回；
6. 追加一条 surface 替换事件：携带（编辑后的）内容、落在原位置、引用被屏蔽的全部节点；随后 `flush` 确认落盘；
7. 以 `rollback-<token>` 唤醒会话；轮到它入队时若撤回仍然有效，则抑制这条唤醒消息的追加——模型看到的只有撤回后的历史，不会多出一份副本；
8. 消息 ID 唯一且操作落盘；断线重试只核对（`status`）不重发，崩溃恢复会补齐丢失的唤醒消息；
9. 落盘失败以 `NO_PERSISTENCE` 拒绝，不假装成功。

另外：

- 内联编辑、重试、历史浮层与引用回复都走本机同源 HTTP 路由（一次性 nonce + 同源/Origin 校验），不会把 `rollback` 命令卡片写进对话；命令通道仅作为没有 Web 服务器时的降级路径和 Agent 工具入口；
- 每个会话一把排他锁，进程崩溃后可识别并安全回收死进程的锁；
- 备份目录拒绝符号链接；
- 所有路径写入都经过 SHA-256 文件名映射，避免键名穿越；
- 请求体上限 2 MiB，JSON 记录上限 16 MiB，文件对象流式读写。

## 本地存储

```text
$DSH_HOME/content-rollback/v1/<profile-hash>/
├── snapshots/   # 原始事件 + 对象清单（JSON）
├── objects/     # 图片/文件字节，按 SHA-256 命名、去重
├── operations/  # 操作状态机（WAL）
├── drafts/      # 编辑草稿与版本号
└── locks/       # 会话级操作锁
```

- 图片和文件对象**永不自动删除**；删除目录即清空本插件数据。
- 目录权限 `0700`，文件 `0600`。
- 备份仅保存在运行 DSH 的这台机器上。

## 架构

```text
index.js                 Host 入口：命令、工具、会话事件备份、Host 适配、pre-step 撤回落地
src/host/domain.js       纯逻辑：事件计划、内容编辑、引用回复、撤回区间、请求校验
src/host/service.js      状态机、锁、幂等、撤回落地与 Reconcile
src/host/vault.js        字节级保险库：捕获、摘要校验、原子写、恢复
src/host/http.js         同源 nonce 路由：界面与 Host 的干净通信
src/client/index.jsx     消息内联编辑/撤回重发、助手重试、历史浮层、选区回复、引用卡片、Toast
src/client/transport.js  同源 HTTP 通道与命令降级
src/client/styles.js     Claude 风格主题化样式
src/client/locale.js     中英文文案
locale/*.json            Plugin Manager 展示元数据
scripts/                 构建、校验、发布检查
test/                    领域、服务、Host、HTTP、传输、保险库、Windows 行为
```

操作状态机：

```text
prepared ──edit──▶ ready ──send──▶ accepted（撤回已落地）
    │                 │                 └────▶ uncertain（旧版本遗留）
    ├────────────retry──────────────────────────┘
    └────────────resend (one-shot)──────────────▶ accepted
```

`prepared` 只代表已备份；`edit` 不解锁任何历史操作，只是允许改文字；`ready` 也不发送；只有 `send`/`retry`/`resend` 才进入发送链路。`resend` 用客户端 `requestId` 作为操作 token，重复提交只核对不重发。

撤回链路（所有发送共用）：

```text
quiesce ──▶ 计算撤回区间 ──▶ append(user/message, surfaceOp=replace) ──▶ flush
                                                                    │
                                              唤醒 rollback-<token> ◀┘
                                                                    │
                              agent/pre-step：区间仍有效则抑制唤醒消息的追加
```

DSH 的事件日志只追加，永不改写；撤回通过一条 `surfaceOp: replace` 事件把目标消息及其后回合从**派生历史**中屏蔽，替换事件自身携带（编辑后的）内容并占据原位置。轮到唤醒消息入队时（`agent/pre-step`），插件复核撤回仍有效，然后抑制这条消息的追加，模型因此只会看到撤回后的历史。崩溃恢复时按操作记录补齐唤醒消息，保证幂等。

## 开发与测试

```bash
npm ci
npm run build     # esbuild 打包 client/client.js
npm test          # node:test，116 项
npm run verify    # 清单、语法、资源、懒加载、同会话约束
npm run check     # build + test + verify
npm pack --dry-run
```

测试覆盖：

- 同会话重发、内联编辑、本轮重试、引用回复、幂等与不确定态；
- 原文/附件顺序、零字节文件、40 MiB 流式读写、摘要/长度损坏；
- 权限、草稿版本冲突、死进程锁回收、活进程锁保护；
- Windows 目录同步差异与文件 fsync 失败传播；
- 客户端不得出现 fork/create/导航调用。

已在本机 `Node 26.8.2` 与 DSH 自带 `Node 24.21.0` 上通过全部测试。

### 真机验证记录

2026-10-23 使用独立的临时 `DSH_HOME` 与真实 DSH `0.2.1-rc.2` 完成：

- 用户消息悬停动作、气泡内联编辑卡片、`Esc` 取消、发送后新消息追加到同一会话；
- 助手回答动作行的 **重试本轮**、Toast 反馈与历史浮层 **重试最近一轮**；
- 历史浮层列表、按消息继续编辑、未完成草稿恢复入口；
- 引用按钮、引用卡片与引用回复编辑器；
- 深色与浅色主题下的气泡、编辑卡片、历史浮层、引用编辑器与 Toast；
- 浏览器控制台无报错，发送后会话 ID 不变，旧消息与旧回答保留。

该环境没有模型凭据，因此模型回复本身显示 `MISSING_CREDENTIAL`；发送链路、消息追加与 UI 状态均正常。

## 发布自动化

- `.github/workflows/ci.yml`：push / PR 在 Ubuntu、macOS、Windows 上跑 Node 22 与 24，执行 `npm ci && npm run check`。
- `.github/workflows/release.yml`：推送 `v*` 标签时校验标签与版本、CHANGELOG，执行 `npm publish --provenance` 并创建 GitHub Release。

发布前：

```bash
npm version patch|minor|major
git push --follow-tags
```

需要在仓库 Secrets 中配置 `NPM_TOKEN`。`npm run release:check` 可在本地预检标签/版本/CHANGELOG 是否一致。

## 兼容性

- macOS、Windows、Linux（测试覆盖三平台 CI；Windows 目录同步依赖 NTFS 元数据日志）。
- 浅色/深色主题；窄屏（≤560px）浮层占满输入区宽度。
- 中文/英文界面；文案全部走 Client locale。
- DSH `0.2.1-rc.2` 事件与附件接口；升级 DSH 大版本前请先跑 `npm run check`。

## English quick start

`dsh-content-rollback` lets you edit and resend a message you already sent **in the same conversation**, retry the turn behind an assistant answer, and add a reply that quotes text you select. Text, images, files and video references are preserved from the bytes DSH actually stored. Backups are local, SHA-256 verified and never uploaded.

- Hover a user message for **Edit**, **Resend** and **Copy**; the editor opens in place of the bubble.
- Use **Retry turn** beside a completed answer, or **Retry last turn** in the compact history popover above the composer.
- Select conversation text and use the quote button in the composer toolbar.

It does **not** erase prior messages from the transcript (DSH exposes no such public API), does not revert tool side effects, and does not recover pre-normalization originals. Works on macOS, Windows and Linux with DSH `0.2.1-rc.2`.

Install through the official `plugin_manager` `install_bundle` action.

## License

[MIT](LICENSE) © 2026 github-llh
