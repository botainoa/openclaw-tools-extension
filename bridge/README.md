# Bridge (Phase 1 + 2)

Fastify-based localhost bridge for RightClaw clients.

## Critical deployment rule

Run bridge on the same host as OpenClaw.

- If OpenClaw runs on a VPS, bridge must run on that VPS.
- If OpenClaw runs locally, bridge should run locally.
- Remote clients (browser/laptop) connect to that bridge over SSH tunnel or Tailscale.

## Endpoints

- `GET /health`
- `POST /v1/action`

## Required request header

- `X-OpenClaw-Client-Key`

## Quick start (local or VPS)

```bash
cd bridge
cp .env.example .env
# edit .env and set real values (do not commit this file)
npm install
set -a
source .env
set +a
npm run dev
```

Production start (compiled):

```bash
cd bridge
npm install
npm run build
set -a
source .env
set +a
npm start
```

## Run On VPS (Telegram Relay Mode)

Use this when `openclaw` CLI is available on the VPS (not on your laptop).

1. Install prerequisites on VPS:
   - Node.js 20+ and npm
   - `openclaw` CLI installed on VPS
   - `openclaw` CLI authenticated on VPS for your Telegram channel/account
2. Prepare bridge config on VPS (`bridge/.env`):

```bash
OPENCLAW_CLIENT_KEY=<bridge_client_key>
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_TOKEN=<gateway_token>
OPENCLAW_SESSION_KEY=agent:main:main
OPENCLAW_MODEL=openclaw:main

# Enable CLI relay to Telegram
OPENCLAW_TELEGRAM_TARGET=<chat_id_or_username>
OPENCLAW_TELEGRAM_CHANNEL=telegram
# Strongly recommended for systemd environments
OPENCLAW_CLI_PATH=/absolute/path/to/openclaw

OPENCLAW_FORWARD_TIMEOUT_MS=6000
OPENCLAW_FORWARD_MAX_RETRIES=1
OPENCLAW_FORWARD_DEBUG=1

# Optional bookmark store path.
# Default if unset: ../BOOKMARKS.md (repo root)
# Recommended on OpenClaw VPS: /home/<user>/.openclaw/workspace/BOOKMARKS.md
# OPENCLAW_BOOKMARKS_PATH=/absolute/path/to/BOOKMARKS.md

# Optional flashcards store path.
# Default if unset: ../FLASHCARDS.md (repo root)
# Recommended on OpenClaw VPS: /home/<user>/.openclaw/workspace/FLASHCARDS.md
# OPENCLAW_FLASHCARDS_PATH=/absolute/path/to/FLASHCARDS.md

BRIDGE_PORT=8787
```

3. Start bridge on VPS:

```bash
cd bridge
npm install
npm run build
npm start
```

4. Verify CLI works on VPS (required for Telegram relay):

```bash
openclaw message send --channel telegram --target <chat_id_or_username> --message "bridge cli test"
```

5. Run as a persistent system service (recommended):

> You can also use PM2, but systemd is preferred on VPS for native boot/startup integration and clearer ops logs.

- Example unit file (sanitized, no secrets):
  - `bridge/deploy/systemd/openclaw-bridge.service.example`
- Step-by-step install guide:
  - `bridge/deploy/systemd/INSTALL.md`

Install with placeholders replaced:

```bash
sudo cp bridge/deploy/systemd/openclaw-bridge.service.example /etc/systemd/system/openclaw-bridge.service
# edit /etc/systemd/system/openclaw-bridge.service and replace placeholders
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-bridge
sudo systemctl status openclaw-bridge
```

Useful operations:

```bash
sudo systemctl restart openclaw-bridge
sudo journalctl -u openclaw-bridge -f
```

Hardening note:

- For Node.js services, keep `MemoryDenyWriteExecute=false` in systemd units (V8 JIT requires executable memory mappings).

6. Optional remote access from your local machine:

- **SSH tunnel (simple and safe):**

```bash
ssh -N -L 8787:127.0.0.1:8787 <user>@<vps-host>
```

Then keep extension/`curl` target at `http://127.0.0.1:8787`.

- **Tailscale Serve (tailnet-only):**

```bash
# one-time so your user can manage serve without sudo
sudo tailscale set --operator=$USER

# expose bridge on a dedicated HTTPS port (avoids conflicts)
tailscale serve --bg --https=8443 --set-path / 127.0.0.1:8787
tailscale serve status
```

Then call the bridge via your node tailnet URL, for example:

```bash
https://<your-node>.<your-tailnet>.ts.net:8443/v1/action
```

## Upstream forwarding config

Bridge forwards non-bookmark actions (`summarize`, `explain`, `flashcards`, `prompt`) to OpenClaw using the OpenAI-compatible HTTP endpoint:

- `POST $OPENCLAW_BASE_URL/v1/chat/completions`
- Header: `Authorization: Bearer $OPENCLAW_TOKEN`
- Header: `x-openclaw-session-key: $OPENCLAW_SESSION_KEY`
- Optional header: `x-openclaw-agent-id: $OPENCLAW_AGENT_ID`
- Body model: `OPENCLAW_MODEL` (default `openclaw:main`)

Optional Telegram relay via CLI:

- Set `OPENCLAW_TELEGRAM_TARGET` to enable CLI send step.
- Bridge runs: `openclaw message send --channel <channel> --target <target> --message <text>`
- If binary path is not on `PATH`, set `OPENCLAW_CLI_PATH`.
- Bookmark and flashcards actions also send short Telegram confirmation messages by default when `OPENCLAW_TELEGRAM_TARGET` is set.

`/v1/chat/completions` must be enabled in your OpenClaw Gateway config.

## Bookmark action storage

For `action="bookmark"`, the bridge writes directly to `BOOKMARKS.md` on the VPS.

- Default path: `../BOOKMARKS.md` (repo root relative to `bridge/`)
- Recommended in production: set `OPENCLAW_BOOKMARKS_PATH` to your OpenClaw workspace, e.g. `/home/<user>/.openclaw/workspace/BOOKMARKS.md`
- Optional override: `OPENCLAW_BOOKMARKS_PATH`
- Includes: timestamp, title, URL, source, optional tags, optional note snippet
- Uses `idempotencyKey` to avoid duplicate entries on client retries
- Deduplicates by canonical URL (ignores fragments and common tracking query params such as `utm_*`, `fbclid`, `gclid`)
- Sends a short Telegram confirmation by default when `OPENCLAW_TELEGRAM_TARGET` is configured:
  - `🔖 Saved bookmark: ...` for new entries
  - `🔖 Already bookmarked: ...` for URL duplicates
- Telegram confirmation is sent asynchronously so bookmark requests return quickly even if Telegram relay is slow

This makes it easy to ask the assistant later for "latest bookmarks" by reading the Markdown file.

Migration tip:

```bash
# Move existing repo-local file to OpenClaw workspace path (example)
mv ../BOOKMARKS.md /home/<user>/.openclaw/workspace/BOOKMARKS.md
```

## Flashcards action storage

For `action="flashcards"`, the bridge writes generated cards to `FLASHCARDS.md`.

- Default path: `../FLASHCARDS.md` (repo root relative to `bridge/`)
- Recommended in production: set `OPENCLAW_FLASHCARDS_PATH` to your OpenClaw workspace, e.g. `/home/<user>/.openclaw/workspace/FLASHCARDS.md`
- Optional override: `OPENCLAW_FLASHCARDS_PATH`
- Stores: timestamp, title, source, url, idempotency key, request id, and generated Q/A content
- Uses model-generated topic title when structured flashcards output is returned (fallback: request title)
- Uses `idempotencyKey` to avoid duplicate writes on retries
- Sends a short Telegram acknowledgment by default when `OPENCLAW_TELEGRAM_TARGET` is configured:
  - `🧠 Flashcards saved: ...`
  - `🧠 Flashcards already saved: ...` on idempotent retries

Migration tip:

```bash
# Move existing repo-local file to OpenClaw workspace path (example)
mv ../FLASHCARDS.md /home/<user>/.openclaw/workspace/FLASHCARDS.md
```

## Behavior

- `sent` -> HTTP 200
- `queued` -> HTTP 202 (timeout path)
- `failed` -> HTTP 502 (upstream unavailable/error)

## Notes

- Action aliases are normalized at the boundary (`summarise` -> `summarize`).
- Bridge logs request metadata (`requestId`, action, source, status, ack latency) without logging full selection text.
