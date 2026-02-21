# Bridge (Phase 1 + 2)

Fastify-based localhost bridge for OpenClaw Tools clients.

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
# Optional if binary is not on PATH
# OPENCLAW_CLI_PATH=/usr/local/bin/openclaw

OPENCLAW_FORWARD_TIMEOUT_MS=6000
OPENCLAW_FORWARD_MAX_RETRIES=1
OPENCLAW_FORWARD_DEBUG=1

# Optional bookmark store path.
# Default if unset: ../BOOKMARKS.md (repo root)
# Recommended on OpenClaw VPS: /home/<user>/.openclaw/workspace/BOOKMARKS.md
# OPENCLAW_BOOKMARKS_PATH=/absolute/path/to/BOOKMARKS.md

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

Bridge forwards to OpenClaw using the OpenAI-compatible HTTP endpoint:

- `POST $OPENCLAW_BASE_URL/v1/chat/completions`
- Header: `Authorization: Bearer $OPENCLAW_TOKEN`
- Header: `x-openclaw-session-key: $OPENCLAW_SESSION_KEY`
- Optional header: `x-openclaw-agent-id: $OPENCLAW_AGENT_ID`
- Body model: `OPENCLAW_MODEL` (default `openclaw:main`)

Optional Telegram relay via CLI:

- Set `OPENCLAW_TELEGRAM_TARGET` to enable CLI send step.
- Bridge runs: `openclaw message send --channel <channel> --target <target> --message <text>`
- If binary path is not on `PATH`, set `OPENCLAW_CLI_PATH`.
- Bookmark actions also send a Telegram confirmation message by default when `OPENCLAW_TELEGRAM_TARGET` is set.

`/v1/chat/completions` must be enabled in your OpenClaw Gateway config.

## Bookmark action storage

For `action="bookmark"`, the bridge writes directly to `BOOKMARKS.md` on the VPS.

- Default path: `../BOOKMARKS.md` (repo root relative to `bridge/`)
- Recommended in production: set `OPENCLAW_BOOKMARKS_PATH` to your OpenClaw workspace, e.g. `/home/<user>/.openclaw/workspace/BOOKMARKS.md`
- Optional override: `OPENCLAW_BOOKMARKS_PATH`
- Includes: timestamp, title, URL, source, optional tags, optional note snippet
- Uses `idempotencyKey` to avoid duplicate entries on client retries
- Sends a short Telegram "bookmark saved" confirmation by default when `OPENCLAW_TELEGRAM_TARGET` is configured
- Telegram confirmation is sent asynchronously so bookmark requests return quickly even if Telegram relay is slow

This makes it easy to ask the assistant later for "latest bookmarks" by reading the Markdown file.

Migration tip:

```bash
# Move existing repo-local file to OpenClaw workspace path (example)
mv ../BOOKMARKS.md /home/<user>/.openclaw/workspace/BOOKMARKS.md
```

## Behavior

- `sent` -> HTTP 200
- `queued` -> HTTP 202 (timeout path)
- `failed` -> HTTP 502 (upstream unavailable/error)

## Notes

- Action aliases are normalized at the boundary (`summarise` -> `summarize`).
- Bridge logs request metadata (`requestId`, action, source, status, ack latency) without logging full selection text.
