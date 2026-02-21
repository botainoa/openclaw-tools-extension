# RightClaw Implementation Plan (Current)

Generated: 2026-02-21

> This document reflects current state and near-term roadmap.
> For setup instructions, use the root `README.md` first.

---

## 1) Current state

### Implemented

- Bridge service (`bridge/`):
  - `GET /health`
  - `POST /v1/action`
  - auth + strict payload validation + stale timestamp checks
  - structured responses (`sent|queued|failed`)
- Action handling:
  - `bookmark`: direct Markdown storage (`BOOKMARKS.md`)
  - `summarize|explain|prompt`: OpenClaw chat-completions forwarding
- Bookmark behavior:
  - append structured entries
  - idempotency dedupe
  - canonical URL dedupe
  - async Telegram confirmation (`Saved` / `Already bookmarked`)
- Chrome extension MVP (`extension/`):
  - context menu actions
  - options page (bridge URL, client key, timeout, response mode)
  - health test + last result panel
- Deployment docs:
  - systemd service template and install guide
  - Tailscale Serve route guidance

### Operational rule

Bridge should run on the same host as OpenClaw (typically the VPS), and clients connect remotely via SSH tunnel or Tailscale.

---

## 2) MVP completion checklist

- [x] Right-click action from extension to bridge
- [x] Secure bridge request validation
- [x] Telegram responses for non-bookmark actions
- [x] Bookmark persistence and dedupe
- [x] Production runtime via systemd

---

## 3) Near-term priorities

1. **Polish onboarding UX**
   - keep docs aligned with real deployment path
   - add screenshots/GIF for extension options and context menu

2. **Client quality improvements**
   - better user-facing error copy for common failure codes
   - configurable timeout presets (fast/normal/slow network)

3. **Bookmark retrieval UX**
   - helpers for latest N bookmarks and tag/date filters
   - optional tiny parser utility for Markdown bookmark querying

4. **Operational hardening**
   - optional rate limiting by client key
   - optional health endpoint detail mode for diagnostics

---

## 4) Mid-term roadmap

1. **Native macOS app**
   - implement same payload contract as extension
   - include custom prompt + selected text actions

2. **Contract test suite**
   - shared fixtures for Chrome and macOS payloads
   - regression coverage for dedupe and validation edge cases

3. **Optional provider abstraction**
   - keep current OpenClaw-first path
   - evaluate pluggable relay adapters only if needed

---

## 5) Definition of done for “stable v1”

Stable v1 is reached when:

1. New user can self-host using docs without chat support.
2. Bridge uptime is stable under systemd with restart-on-failure.
3. Extension actions are predictable and understandable on failure.
4. Bookmark duplicates are consistently prevented (retry + URL variants).
5. macOS client reaches feature parity with Chrome actions.

---

## 6) Out of scope (for now)

- Multi-user tenancy and per-user storage separation
- Public internet exposure without private network controls
- Heavy analytics/telemetry backend
