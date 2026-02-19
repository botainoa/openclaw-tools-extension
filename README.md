# OpenClaw Tools Chrome Extension

A lightweight Chrome extension concept that adds an **"OpenClaw Tools"** context menu to pages, links, and selected text.

## Goal

Make it effortless to send web context into OpenClaw with one right-click action.

Planned context-menu actions include:

- **Bookmark** — save URL + metadata into `BOOKMARKS.md` for later recall.
- **Summarise** — ask OpenClaw for a concise summary of the current page.
- **Explain** — ask OpenClaw to explain selected text or page content.

## Project scope (initial)

This repository currently contains only scaffolding and product direction.
No extension code has been implemented yet.

## Proposed architecture (high level)

1. Chrome extension captures context (`url`, `title`, optional selection).
2. Extension posts payload to a small local bridge service.
3. Bridge forwards request to OpenClaw session (`agent:main:main`).
4. OpenClaw handles action and persists bookmarks in markdown.
5. For **Summarise** and **Explain**, OpenClaw sends an immediate response to the user's Telegram chat (same active assistant conversation).

## Data approach

Bookmarks are intended to be stored in a human-readable markdown file:

- `BOOKMARKS.md` (append-only entries grouped by date)

## MVP requirement

- Clicking **Summarise** or **Explain** should trigger an immediate answer in Telegram (in the user's existing OpenClaw chat), without requiring the user to manually prompt there.

## Next milestones

1. Define extension manifest + permissions.
2. Implement context menu actions and payload schema.
3. Build local bridge endpoint with auth.
4. Add OpenClaw-side action handlers + Telegram response routing for Summarise/Explain.
5. Implement bookmark write/read conventions in `BOOKMARKS.md`.

## Status

🚧 Scaffolding only — no production code yet.
