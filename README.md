# dsh-content-rollback · 对话回溯

[![CI](https://github.com/github-llh/dsh-content-rollback/actions/workflows/ci.yml/badge.svg)](https://github.com/github-llh/dsh-content-rollback/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/dsh-0.2.1--rc.2-426B65)](https://deepseek-harness.github.io/deepseek-harness/)

在**同一个 DSH 会话**里找回已经发出的内容并重新发送：原样重发、取回编辑后重发、引用选中的文本回复。文字、图片、文件与视频引用都会保留；备份写入本机，断线、双击、切模型、切工作区都不会造成重复发送或串会话。

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

## 能力

| 能力 | 说明 |
|---|---|
| 原样重发 | 内容块逐字节/逐字段还原，包含图片、文件、视频引用与未知元数据 |
| 取回编辑 | 只编辑文字块；图片、文件、顺序、`offloaded` 等标记不会被改动 |
| 引用回复 | 选中文本 → 引用卡片 → 写回复 → 添加到当前会话 |
| 字节级备份 | 图片与文件按 SHA-256 去重；读取时校验长度与摘要；宿主对象丢失时可用备份重建 |
| 会话隔离 | 操作绑定确切 sessionId；切会话后旧操作不可被调用 |
| 模型保护 | 发送前比对页面展示的模型与当前会话模型，不一致时阻止并保留草稿 |
| 幂等发送 | 客户端 requestId + Host 侧消息 ID 去重；断线重试不会重复入队 |
| 不确定态保护 | 已入队但未确认落盘时进入 `uncertain`，绝不自动重发 |
| 草稿保护 | 编辑内容保存在 Host，带版本号；多页面冲突时要求显式选择，不覆盖已有内容 |
| 隐私 | 不访问外部网络；面板只调用本机 DSH 同源路由。备份只在本机 `$DSH_HOME` 下，权限 `0700/0600` |

## 明确不做什么

1. **不删除历史**。旧消息、旧回复继续留在会话和模型上下文中。没有公开 API 可以重写原生 transcript。
2. **不撤销副作用**。工具改过的文件、执行过的命令、调用的外部服务不会回滚。重发可能让工具再次执行，UI 会提示该消息之后有多少次工具调用。
3. **不恢复“上传前原图”**。DSH 在写入前会做规范化（压缩、去元数据、动画只留首帧），插件保存的是**已经发出去的那个版本**。
4. **不保证视频可被模型解析**。视频按普通文件字节保存与重发，模型是否支持取决于所选模型。
5. **不复制 `@路径` 指向的文件**。路径引用只是文字；原文件变化后无法还原。
6. **不跨机器同步**。备份没有云端，也不会自动清理；需要时可手动删除存储目录。
7. **不接管 DSH 输入框**。编辑与引用回复都在插件自己的面板内完成，不会覆盖你正在写的 composer 草稿。
8. **重发依赖会话持久化**。默认 DSH 组合自带 JSONL 持久化；如果部署移除了持久化后端，插件会以 `NO_PERSISTENCE` 拒绝发送，而不是假装成功。备份目录不可写时插件仍会加载，并返回 `STORAGE_UNAVAILABLE`，不会阻塞整个 DSH 启动。

## 安装

要求：DSH `0.2.1-rc.2`（`>=0.2.1-rc.2 <0.3.0`）、Node `>=22.19.0`。

按 DSH 官方插件规范，使用 `plugin_manager` 的 `install_bundle` 安装，**不要**手写 profile 的 `package.json` 或 `cordis.patch.yml`：

1. 将本仓库放到一个工作区目录（例如 `~/company/sy/plugin/dsh-content-rollback`）。
2. 在 DSH 会话中让 Agent 执行 `plugin_manager` → `install_bundle`，`target` 指向该目录的绝对路径。
3. 读取返回的 `application` 与 `warnings`；替换已安装的同名包通常需要重启 DSH。
4. 打开任意会话，输入框上方应出现“对话回溯”入口。

安装后的插件行由 `cordis.patch.yml` 插入，配置为空对象，无需手工调参。

## 使用

### 编辑与重试

1. 选择一条历史用户消息，看到原始内容卡片、时间、序号与工具调用提示；
2. **原样重发**：直接在当前会话再发一次原始内容；
3. **编辑后重发**：进入内联编辑，文字块自动增高、首段自动聚焦；`⌘/Ctrl + Enter` 发送，`Esc` 或“完成编辑”退出；
4. **发送修改**：把当前草稿写入同一会话；**影响与限制**默认折叠，需要时再展开；
5. 仅当会话正在生成时显示“先停止当前生成”，且不会清空排队消息。

整个流程只使用当前会话，不会新建、切换或跳转会话。

### 引用选中文本回复

1. 在对话中选中一段文字（插件面板内部的选择会被忽略）；
2. 点击浮出的 **引用选中**；
3. 在引用卡片下写回复；
4. `⌘/Ctrl + Enter` 或 **添加到当前会话**。

引用会以 `>` 前缀作为独立文本块，并以空行与回复正文分开。选择上限 4000 字符，回复上限 16000 字符。

### 命令与 Agent 工具

`/rollback` 接受 JSON 请求，便于脚本或 Agent 调用：

```text
/rollback {"action":"list"}
/rollback {"action":"prepare","seq":42}
/rollback {"action":"execute","token":"<uuid>","mode":"retry","route":{"provider":"...","model":"..."}}
/rollback {"action":"reply","text":"补充说明","quote":"被引用的句子","requestId":"<uuid>"}
```

Agent 侧工具名为 `conversation_recovery`，参数与命令一致。工具不会在用户未要求时主动执行恢复。

## 交互与快捷键

- 面板采用宿主主题变量（`--dsw-alias-*`），自动适配浅色/深色与紧凑宽度。
- `Esc` 关闭引用回复或面板；`⌘/Ctrl + Enter` 发送引用回复。
- 保存状态、发送结果与错误均通过 `role="status"` / `role="alert"` 播报。
- 禁用动画时遵循 `prefers-reduced-motion`。
- 不写 `document.body`、不读取其他插件的 DOM；只读取浏览器当前选区文本。

## 安全机制

发送链路按顺序执行，任一步失败都不会产生“偷偷重发”：

1. 读取会话日志，确认目标消息指纹未变化；
2. 校验本地备份的每个对象（长度 + SHA-256），必要时用备份重建宿主附件并复核；
3. 停顿时检查：会话空闲、队列为空；用户勾选“先停止”时才取消当前生成（保留排队输入）；
4. 等待持久化水位 `flush` 确认；
5. 复核模型、会话游标、权限；
6. 冻结 `sending` 状态后再入队；
7. 消息 ID 为 `rollback-<token>`，重复调用只核对不重发；
8. 落盘失败进入 `uncertain`，需要人工核对，不允许自动补救式重发。

另外：

- 面板操作走本机同源 HTTP 路由（一次性 nonce + 同源/Origin 校验），不会把 `rollback` 命令卡片写进对话；命令通道仅作为没有 Web 服务器时的降级路径和 Agent 工具入口；
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
index.js                 Host 入口：命令、工具、会话事件备份、Host 适配
src/host/domain.js       纯逻辑：事件计划、内容编辑、引用回复、请求校验
src/host/service.js      状态机、锁、幂等、Reconcile
src/host/vault.js        字节级保险库：捕获、摘要校验、原子写、恢复
src/host/http.js         同源 nonce 路由：面板与 Host 的干净通信
src/client/index.jsx     Composer dock UI：历史、编辑、引用回复
src/client/transport.js  同源 HTTP 通道、命令降级与草稿写入队列
src/client/styles.js     Claude 风格主题化样式
src/client/locale.js     中英文文案
locale/*.json            Plugin Manager 展示元数据
scripts/                 构建、校验、发布检查
test/                    领域、服务、Host、HTTP、传输、保险库、Windows 行为
```

操作状态机：

```text
prepared ──edit──▶ ready ──send──▶ sending ──▶ accepted
    │                 │                 └────▶ uncertain
    └────────────retry──────────────────────────┘
```

`prepared` 只代表已备份；`edit` 不解锁任何历史操作，只是允许改文字；`ready` 也不发送；只有 `send`/`retry` 才进入发送链路。

## 开发与测试

```bash
npm ci
npm run build     # esbuild 打包 client/client.js
npm test          # node:test，105 项
npm run verify    # 清单、语法、资源、懒加载、同会话约束
npm run check     # build + test + verify
npm pack --dry-run
```

测试覆盖：

- 同会话重发、取回编辑、引用回复、幂等与不确定态；
- 原文/附件顺序、零字节文件、40 MiB 流式读写、摘要/长度损坏；
- 权限、草稿版本冲突、死进程锁回收、活进程锁保护；
- Windows 目录同步差异与文件 fsync 失败传播；
- 客户端不得出现 fork/create/导航调用。

已在本机 `Node 26.8.2` 与 DSH 自带 `Node 24.21.0` 上通过全部测试。

### 真机验证记录

2026-10-23 使用独立的临时 `DSH_HOME` 与 `plugin` CLI 安装本插件，在 DSH `0.2.1-rc.2` 上完成：

- 插件元数据、中文描述、图标（data URL 200）与 Composer dock 渲染；
- 选中对话文本 → 引用卡片 → 写入同一会话；
- 消息列表、备份准备、取回编辑、草稿保存、编辑后发送的完整 UI 流程；
- 发送后会话 ID 不变，历史消息保留；同一 `requestId` 二次提交返回 `duplicate`；
- 面板操作前后会话事件水位保持不变，确认不会把命令卡片写入对话。

该环境没有模型凭据，因此模型回复本身显示 `MISSING_CREDENTIAL`；与插件发送链路无关。

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
- 浅色/深色主题；窄屏（≤520px）单列布局。
- 中文/英文界面；文案全部走 Client locale。
- DSH `0.2.1-rc.2` 事件与附件接口；升级 DSH 大版本前请先跑 `npm run check`。

## English quick start

`dsh-content-rollback` lets you recover a message you already sent and resend it **in the same conversation** — unchanged or after editing the text — and add a reply that quotes text you select. Text, images, files and video references are preserved from the bytes DSH actually stored. Backups are local, SHA-256 verified and never uploaded.

It does **not** erase prior messages from the transcript (DSH exposes no such public API), does not revert tool side effects, and does not recover pre-normalization originals. Works on macOS, Windows and Linux with DSH `0.2.1-rc.2`.

Install through the official `plugin_manager` `install_bundle` action; the panel appears above the composer. Select text and choose **Quote selection** to reply with a quotation.

## License

[MIT](LICENSE) © 2026 github-llh
