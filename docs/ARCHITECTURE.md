# Architecture

## Primary rule

Run the **bridge on the same host as OpenClaw**.

- If OpenClaw runs on a VPS, run bridge on that VPS.
- If OpenClaw runs locally, run bridge locally.
- Clients (Chrome, future macOS app) can run elsewhere and call the bridge over SSH tunnel or Tailscale.

This avoids profile/channel mismatches and keeps Telegram delivery reliable.

## Objective

Provide one shared action pipeline for:
- Chrome extension (implemented)
- Native macOS app (planned)

with fast request acknowledgements and Telegram delivery through OpenClaw.

## Components

1. **Client surfaces**
   - Chrome extension (`extension/`)
   - macOS app (planned)

2. **Bridge service** (`bridge/`)
   - Fastify API: `GET /health`, `POST /v1/action`
   - Validates request auth + payload + timestamp
   - Routes actions:
     - `bookmark` → writes to `BOOKMARKS.md`
     - `summarize|explain|prompt` → forwards to OpenClaw `/v1/chat/completions`

3. **OpenClaw Gateway / Session**
   - Generates assistant output for non-bookmark actions
   - Sends user-visible Telegram responses via relay path

4. **Bookmark store**
   - Markdown file (`BOOKMARKS.md`)
   - Recommended location: `~/.openclaw/workspace/BOOKMARKS.md`

## End-to-end flows

### A) Summarize / Explain / Prompt

1. User triggers action in client.
2. Client sends payload to `POST /v1/action` with `X-OpenClaw-Client-Key`.
3. Bridge validates request and forwards to OpenClaw chat completions.
4. Bridge maps upstream result to `sent|queued|failed`.
5. OpenClaw response is relayed to Telegram.

### B) Bookmark

1. User triggers bookmark action.
2. Bridge validates request.
3. Bridge writes bookmark entry to Markdown directly.
4. Bridge deduplicates by:
   - `idempotencyKey` (retry dedupe)
   - canonical URL (URL-level dedupe)
5. Bridge returns quickly to client and sends Telegram ack asynchronously (`Saved` or `Already bookmarked`).

## Status codes

Bridge API returns:
- `200` with `status=sent`
- `202` with `status=queued`
- `4xx/5xx` with `status=failed` and `errorCode`

## Deployment topologies

### Recommended production
- OpenClaw + bridge on VPS
- Client devices connect over Tailscale (`https://<node>.<tailnet>.ts.net:8443`)

### Development
- OpenClaw + bridge on local machine
- Extension points at `http://127.0.0.1:8787`

## Current gaps / next architecture steps

- Native macOS client implementation
- Optional richer bookmark metadata (notes/tags from future clients)
- Optional server-side rate limits for abusive clients
