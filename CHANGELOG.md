# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0

### Added

- Quote reply: select text anywhere in the conversation and add a reply that
  quotes it, without leaving the current session.
- Claude-inspired interaction polish: quoted-text card, keyboard-first reply
  composer (`Cmd/Ctrl+Enter`, `Esc`), inline status notices, calmer spacing,
  filled primary actions and light/dark theme tokens.
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
