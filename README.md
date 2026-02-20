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

Bridge MVP implementation is in progress under `bridge/` (health endpoint, action endpoint, payload validation/auth, and OpenClaw forwarding adapter).
Chrome extension and macOS clients are not implemented yet.

## Proposed architecture (high level)

1. Client surface captures context (`url`, `title`, optional selection).
   - Surface A: Chrome extension context menu
   - Surface B (planned): native macOS Swift app
2. Client posts payload to a small local bridge service.
3. Bridge forwards request to OpenClaw session (`agent:main:main`).
4. OpenClaw handles action and persists bookmarks in markdown.
5. For **Summarise** and **Explain**, OpenClaw sends an immediate response to the user's Telegram chat (same active assistant conversation).

## Data approach

Bookmarks are intended to be stored in a human-readable markdown file:

- `BOOKMARKS.md` (append-only entries grouped by date)

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

1. Define Chrome extension manifest + permissions.
2. Implement browser context menu actions and payload schema.
3. Build local bridge endpoint with auth.
4. Add OpenClaw-side action handlers + Telegram response routing for Summarise/Explain.
5. Implement bookmark write/read conventions in `BOOKMARKS.md`.
6. Draft Swift macOS app architecture (menu bar app, text capture flow, prompt UI).
7. Build macOS Swift MVP with Summarise/Explain/Custom Prompt actions.

## Status

🚧 Bridge service (Phase 1/2) implemented; client surfaces pending.

Deployment/runbook details for bridge (including VPS + Telegram relay mode) are in `bridge/README.md`.
