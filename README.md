# OpenClaw Tools

A lightweight cross-surface tools project for sending context into OpenClaw quickly.

Initial focus is a Chrome extension with an **"OpenClaw Tools"** context menu for pages, links, and selected text, plus planned native macOS support via a Swift app.

## Goal

Make it effortless to send web context into OpenClaw with one right-click action.

Planned context-menu actions include:

- **Bookmark** — save URL + metadata into `BOOKMARKS.md` for later recall.
- **Summarise** — ask OpenClaw for a concise summary of the current page.
- **Explain** — ask OpenClaw to explain selected text or page content.

## Project scope (initial)

Bridge MVP implementation under `bridge/` is complete (health endpoint, action endpoint, payload validation/auth, and OpenClaw forwarding adapter).

A private Chrome extension MVP is now implemented under `extension/` (context menus, options, prompt popup, bridge health check).
Native macOS client is still pending.

## Proposed architecture (high level)

1. Client surface captures context (`url`, `title`, optional selection).
   - Surface A: Chrome extension context menu
   - Surface B (planned): native macOS Swift app
2. Client posts payload to a small local bridge service.
3. Bridge forwards request to OpenClaw session (`agent:main:main`).
4. Bridge routes actions:
   - `bookmark`: append structured entry directly to `BOOKMARKS.md` (and send Telegram save confirmation when relay target is configured)
   - other actions: forward to OpenClaw chat-completions pipeline
5. For **Summarise** and **Explain**, OpenClaw sends an immediate response to the user's Telegram chat (same active assistant conversation).

## Data approach

Bookmarks are stored in a human-readable markdown file:

- `BOOKMARKS.md` (append-only entries with timestamp, URL/title, source, optional tags, optional note)
- Recommended deployment path: OpenClaw workspace (`~/.openclaw/workspace/BOOKMARKS.md`) via `OPENCLAW_BOOKMARKS_PATH`

## MVP requirement

- Clicking **Summarise** or **Explain** should trigger an immediate answer in Telegram (in the user's existing OpenClaw chat), without requiring the user to manually prompt there.

## Native macOS support (Swift-first plan)

Planned native companion app for macOS, built in Swift (SwiftUI/AppKit), installable locally.

Target capabilities:

- Trigger actions from selected text in desktop apps (including PDF reading workflows where selection is available).
- Actions: **Summarise**, **Explain**, and **Custom Prompt** input box.
- Route requests through the same local bridge into OpenClaw.
- Receive responses immediately in Telegram (and optionally in-app in a later phase).

## Next milestones

1. Validate Chrome extension E2E against VPS bridge in daily usage.
2. Add extension-side telemetry and quality-of-life improvements.
3. Add retrieval helpers for "latest bookmarks" and filtering by tag/date.
4. Draft Swift macOS app architecture (menu bar app, text capture flow, prompt UI).
5. Build macOS Swift MVP with Summarise/Explain/Custom Prompt actions.

## Status

🚧 Bridge service (Phase 1/2) implemented and Chrome extension MVP shipped; macOS client pending.

Deployment/runbook details for bridge (including VPS + Telegram relay mode) are in `bridge/README.md`.
