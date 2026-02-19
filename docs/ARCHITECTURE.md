# Architecture

## Objective

Provide a unified "OpenClaw Tools" action pipeline across:

- Chrome extension (context menu)
- Native macOS Swift app (selection + prompt actions)

with immediate responses delivered to Telegram via OpenClaw.

## Components

1. **Client surfaces**
   - Chrome extension
   - macOS app (SwiftUI/AppKit)

2. **Local bridge service**
   - Listens on localhost only
   - Validates/authenticates incoming action requests
   - Normalizes payload to shared schema
   - Forwards request to OpenClaw session (`agent:main:main`)

3. **OpenClaw session**
   - Executes action logic (bookmark/summarize/explain/prompt)
   - Sends user-facing response to Telegram
   - Persists bookmarks to `BOOKMARKS.md`

## End-to-end flow

1. User triggers action from Chrome/macOS.
2. Client builds payload conforming to `docs/PAYLOAD_SCHEMA.md`.
3. Client sends signed request to local bridge.
4. Bridge validates auth + payload + size limits.
5. Bridge forwards action text to OpenClaw session.
6. OpenClaw processes action and responds in Telegram.
7. Bridge returns ack/status to client (`sent`, `queued`, or `failed`).

## Failure handling

- If bridge cannot reach OpenClaw, return `queued` and retry in background.
- Client should show status feedback for each action.
- Retries should be bounded and observable.

## Milestones (build order)

1. Bridge + schema + auth baseline
2. Bookmark action (write to `BOOKMARKS.md`)
3. Summarize/Explain action routing to Telegram
4. macOS Swift app integration
