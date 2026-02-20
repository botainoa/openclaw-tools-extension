# Bridge (Phase 1 + 2)

Fastify-based localhost bridge for OpenClaw Tools clients.

## Endpoints

- `GET /health`
- `POST /v1/action`

## Required request header

- `X-OpenClaw-Client-Key`

## Local run

```bash
cd bridge
npm install
set -a
source .env
set +a
npm run dev
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
OPENCLAW_BASE_URL=http://127.0.0.1:3400
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

5. If Chrome extension runs on your local machine, tunnel localhost bridge port:

```bash
ssh -N -L 8787:127.0.0.1:8787 <user>@<vps-host>
```

Then keep extension/`curl` target at `http://127.0.0.1:8787`.

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

`/v1/chat/completions` must be enabled in your OpenClaw Gateway config.

## Behavior

- `sent` -> HTTP 200
- `queued` -> HTTP 202 (timeout path)
- `failed` -> HTTP 502 (upstream unavailable/error)

## Notes

- Action aliases are normalized at the boundary (`summarise` -> `summarize`).
- Bridge logs request metadata (`requestId`, action, source, status, ack latency) without logging full selection text.
