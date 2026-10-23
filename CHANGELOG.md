# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.0

### Added

- **Retracting resend**: editing and resending a user message now retracts the
  original message and every turn the model saw after it, and delivers the
  edited content at the original position. The model reads the conversation as
  if the message had always been the edited version — no duplicate appended at
  the tail, no fork, no new session.
- **Retrying retracts too**: retrying a turn removes the old answer from the
  model-visible history so the regenerated answer is not generated beside it.
- Retracted messages render dimmed with a "retracted" badge; the badge survives
  reloads through the new `marks` action and the per-session mark record.
- Selection reply: selecting text in the conversation floats a **Reply** button
  above the selection (the composer toolbar keeps its quote button).
- Quoted replies render as a quote card above the body in the transcript; the
  blockquoted content the model reads is unchanged.

### Changed

- `resend` and `retry-turn` deliver through one surface replacement plus a
  suppressed wake-up prompt instead of appending a copy at the session tail.
- The two-phase `prepare`/`execute` flow sends through the same retraction
  path; the old tail-append delivery and its cursor contract were removed.
- A send whose target history changed in the meantime is refused with
  `RETRACT_STALE` instead of retracting newer messages.
- Documentation describes the retraction contract: the durable transcript stays
  append-only and fully visible; only the derived model history is rewritten.

### Fixed

- Editing an already-retracted message is disabled instead of producing a
  confusing second retraction.
- A crash between landing the retraction and queueing the wake-up prompt now
  self-heals: reconcile promotes the operation and re-queues the prompt once.
## 0.3.0

### Added

- Inline message actions: hover any user message for **Edit**, **Resend** and
  **Copy**; the editor opens in place of the bubble instead of a detached dock.
- **Retry turn** beside completed assistant answers and **Retry last turn** in
  the history popover. Both resend the triggering user message in the same
  conversation; the old answer stays in place.
- Compact composer history popover with the latest 30 user messages, earlier
  pagination, pending-draft resume and a one-click last-turn retry.
- Host actions `resend`, `retry-turn` and `inspect`. `resend` accepts edited
  text in one request and uses the client request id as the idempotent
  operation token.
- Toast notifications for retry results and send failures.

### Changed

- The always-visible composer dock panel and its draft writer were removed.
  The only composer footprint is a compact history icon plus a quote icon that
  appears when text is selected.
- Quote reply now opens in the composer overlay using the same visual language
  as the inline editor.
- `list` now returns `lastUserSeq` so retrying the latest turn works even when
  that turn failed before producing an assistant message.
- Documentation and plugin metadata describe the inline interaction and the
  append-only retry contract.

### Fixed

- Quote editor textarea no longer falls back to the browser's dark default in
  the light theme.
- A failed replacement never leaves an unhandled rejection in the operation
  journal.
- Reusing a request id with different edited content is rejected with
  `REQUEST_CONFLICT` instead of silently replaying stale text.

## 0.2.0

### Added

- Quote reply: select text anywhere in the conversation and add a reply that
  quotes it, without leaving the current session.
- Claude-inspired interaction polish: quoted-text card, keyboard-first reply
  composer (`Cmd/Ctrl+Enter`, `Esc`), inline status notices, calmer spacing,
  filled primary actions and light/dark theme tokens.
- The same interaction language now applies to edit/retry: a recovered-message
  card, inline auto-growing editor, `完成编辑` / `发送修改` / `原样重发`
  hierarchy, collapsible impact details, and a stop-first control that only
  appears while the conversation is actually generating.
- `reply` operation with a client-generated UUID and Host-side message-id
  deduplication, so retries and double clicks never enqueue twice.
- Same-origin, nonce-protected local HTTP route for panel operations. UI actions
  no longer append `rollback` command cards to the conversation; the command
  transport remains as a fallback and for agent tool calls.
- README, MIT license, changelog, CI matrix and tagged release automation.

### Fixed

- `agent/created` and `agent/disposed` payloads are now read as `{ agent }`,
  matching the real DSH registry contract.
- The Client declares `remote.commands` in addition to `remote`, so
  session-scoped command execution works on a real host.
- Listing a dormant or not-yet-activated session falls back to the default model
  selection instead of failing with a generic recovery error.
- Unexpected errors expose their message in the panel for diagnosis while the
  transcript only receives user-facing codes.
- An unavailable backup directory no longer prevents the whole plugin from
  loading; operations return `STORAGE_UNAVAILABLE` and retry initialization
  without restarting DSH.
- Quoted text is separated from the reply body by a blank line in the rendered
  conversation.

### Changed

- Version metadata now declares DSH `>=0.2.1-rc.2 <0.3.0` and the repository
  does not inject `dsh-client-ui-workspace` anymore.

## 0.1.1

### Changed

- Recovery now stays in the session where it was opened. The branch/fork
  workflow, child-session navigation and the workspace client dependency were
  removed.
- `edit` only unlocks the text editor; `retry` and `send` are the only paths
  that submit a message.
- Tool descriptions and both locales describe the same-session contract and
  spell out that tool side effects are not reverted.

### Fixed

- Unlocking the editor no longer implies stopping a running turn.
- A message admitted in memory but not confirmed by persistence remains
  `uncertain` instead of being reported as accepted.

## 0.1.0

### Added

- Same-session resend of sent user messages from a byte-verified local backup.
- Image, file and video-reference preservation with SHA-256 deduplication,
  streamed reads, and integrity checks before every send.
- Draft versioning, session-scoped permissions, operation WAL, crash-safe
  locks, model/cursor revalidation and explicit uncertainty states.
- Composer dock UI in Chinese and English.
