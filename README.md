# OpenClaw Tools

OpenClaw Tools lets users send browser context to OpenClaw with one right-click action.

Current implementation:
- ✅ **Chrome extension** (`extension/`)
- ✅ **Bridge service** (`bridge/`) that validates and routes actions
- 🚧 **Native macOS app** (planned)

---

## What this project does

From a web page, users can trigger actions such as:
- **Summarize**
- **Explain**
- **Custom Prompt**
- **Bookmark**

The extension sends a request to the bridge (`/v1/action`), and the bridge:
- forwards AI actions to OpenClaw (`/v1/chat/completions`), and
- writes bookmarks directly to Markdown (`BOOKMARKS.md`).

---

## Repository layout

- `bridge/` — Fastify service (`GET /health`, `POST /v1/action`)
- `extension/` — Chrome extension (Manifest V3)
- `docs/` — architecture/security/schema docs

Deep-dive docs:
- Bridge runtime/deploy: [`bridge/README.md`](bridge/README.md)
- Extension usage/options: [`extension/README.md`](extension/README.md)
- Payload contract: [`docs/PAYLOAD_SCHEMA.md`](docs/PAYLOAD_SCHEMA.md)

---

## Critical deployment rule (important)

Run the **bridge on the same machine where OpenClaw is running**.

- If OpenClaw runs on a VPS, run bridge on that VPS.
- If OpenClaw runs on your laptop, run bridge on your laptop.
- The browser extension can run anywhere, but it should call the bridge host where OpenClaw is available.

This avoids auth/profile mismatch issues and keeps Telegram delivery reliable.

---

## Setup paths

Choose one:

1. **Local dev setup** (quick iteration, OpenClaw + bridge both local)
2. **VPS + Tailscale setup** (recommended for real use, OpenClaw + bridge both on VPS)

If you want Telegram replies from actions, you need OpenClaw + Telegram configured on the machine where the bridge runs.

---

## 1) Prerequisites

### Required
- Node.js 20+
- npm
- Git
- Google Chrome
- Running OpenClaw Gateway reachable from bridge machine

### Required for Telegram delivery
- `openclaw` CLI installed on bridge machine
- Telegram channel/account configured in OpenClaw

### Optional (recommended for secure remote access)
- Tailscale

---

## 2) Clone the repository

```bash
git clone https://github.com/botainoa/openclaw-tools-extension.git
cd openclaw-tools-extension
```

---

## 3) Configure the bridge (on your OpenClaw host)

> Do this on the same machine where OpenClaw is running.

```bash
cd bridge
cp .env.example .env
```

Now edit `bridge/.env`.

Minimum required values:

```bash
# shared secret expected from clients (extension/app)
OPENCLAW_CLIENT_KEY=<strong-random-secret>

# OpenClaw Gateway (OpenAI-compatible endpoint host)
OPENCLAW_BASE_URL=http://127.0.0.1:18789
OPENCLAW_TOKEN=<gateway-token>

# session/model routing
OPENCLAW_SESSION_KEY=agent:main:main
OPENCLAW_MODEL=openclaw:main

# Bridge bind
BRIDGE_PORT=8787
```

Recommended for Telegram + bookmark confirmations:

```bash
OPENCLAW_TELEGRAM_TARGET=<chat_id_or_username>
OPENCLAW_TELEGRAM_CHANNEL=telegram
OPENCLAW_CLI_PATH=/absolute/path/to/openclaw
OPENCLAW_TELEGRAM_SEND_TIMEOUT_MS=8000
```

Recommended bookmark file location:

```bash
OPENCLAW_BOOKMARKS_PATH=/home/<user>/.openclaw/workspace/BOOKMARKS.md
```

Forwarding/retry tuning (optional):

```bash
OPENCLAW_FORWARD_TIMEOUT_MS=6000
OPENCLAW_FORWARD_MAX_RETRIES=1
OPENCLAW_FORWARD_DEBUG=0
```

> Never commit `.env`.

---

## 4) Install and run bridge

```bash
npm install
npm run build
npm start
```

Health check:

```bash
curl -sS http://127.0.0.1:8787/health
```

Expected:

```json
{"ok":true,"service":"openclaw-tools-bridge"}
```

---

## 5) Verify OpenClaw + Telegram from the same machine

Verify CLI send works:

```bash
openclaw message send --channel telegram --target <chat_id_or_username> --message "bridge cli test"
```

If this fails, bridge can still save bookmarks but Telegram acks/replies will fail.

---

## 6) Expose bridge to your browser machine

If OpenClaw+bridge run on a VPS, use one of these options so your local browser can reach that VPS bridge.

### Option A: local-only
Keep extension `Bridge URL` as:

```text
http://127.0.0.1:8787
```

### Option B: SSH tunnel

```bash
ssh -N -L 8787:127.0.0.1:8787 <user>@<vps-host>
```

Then in extension use:

```text
http://127.0.0.1:8787
```

### Option C: Tailscale Serve (recommended)

```bash
# one-time
sudo tailscale set --operator=$USER

# expose bridge on dedicated HTTPS port
# (keeps existing 443 routes conflict-free)
tailscale serve --bg --https=8443 --set-path / 127.0.0.1:8787

tailscale serve status
```

Use in extension:

```text
https://<node>.<tailnet>.ts.net:8443
```

---

## 7) Install and configure Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `openclaw-tools-extension/extension`
5. Open extension options and set:
   - **Bridge URL**
   - **Client Key** (must match `OPENCLAW_CLIENT_KEY`)
   - **Response mode** (`telegram|silent|both`)
   - **Request timeout** (start with 20–45s for slower environments)
6. Click **Test Bridge Health**

---

## 8) End-to-end functional checks

### Summarize / Explain / Prompt
- Right click page/selection/link
- Trigger action
- Expect extension success + Telegram reply from OpenClaw

### Bookmark
- Right click page/link → **Bookmark in OpenClaw**
- Expect:
  - bookmark entry in `BOOKMARKS.md`
  - Telegram confirmation (`Saved` or `Already bookmarked`)

Bookmark behavior details:
- appends Markdown entries with timestamp/title/url/source
- optional tags + note snippet
- retry dedupe via `idempotencyKey`
- URL dedupe via canonical URL matching (removes fragments + common tracking params like `utm_*`, `fbclid`, `gclid`)

---

## 9) Run bridge persistently (production)

Use systemd.

- Example unit: `bridge/deploy/systemd/openclaw-bridge.service.example`
- Install guide: `bridge/deploy/systemd/INSTALL.md`

Typical flow:

```bash
sudo cp bridge/deploy/systemd/openclaw-bridge.service.example /etc/systemd/system/openclaw-bridge.service
sudo editor /etc/systemd/system/openclaw-bridge.service
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-bridge
sudo systemctl status openclaw-bridge
```

---

## 10) Upgrade/deploy changes safely

```bash
cd /path/to/openclaw-tools-extension
git pull
cd bridge
npm install
npm run build
sudo systemctl restart openclaw-bridge   # or: systemctl --user restart openclaw-bridge
```

---

## 11) Troubleshooting

### Extension shows `REQUEST_TIMEOUT`
- Increase extension request timeout (e.g. 45000 ms)
- Check bridge logs (`journalctl -u openclaw-bridge -f` or `journalctl --user -u openclaw-bridge -f`)
- Confirm bridge health endpoint is reachable from browser machine

### Bridge health works but no Telegram messages
- Verify `OPENCLAW_TELEGRAM_TARGET`
- Verify `OPENCLAW_CLI_PATH` points to real binary (`which openclaw`)
- Test manual `openclaw message send ...`

### Bookmarks save but duplicates still appear
- Check URL canonicalization edge cases (custom tracking params)
- Confirm client sends stable URL (not changing path/query unexpectedly)

### `UNAUTHORIZED_CLIENT`
- Extension client key does not match `OPENCLAW_CLIENT_KEY`

### `UPSTREAM_UNAVAILABLE`
- Check `OPENCLAW_BASE_URL`, `OPENCLAW_TOKEN`, gateway availability

---

## 12) Security checklist

- Keep bridge bound to localhost (`127.0.0.1`)
- Expose externally only through SSH tunnel or tailnet
- Use strong random `OPENCLAW_CLIENT_KEY`
- Keep `bridge/.env` protected (`chmod 600 bridge/.env`)
- Keep bookmarks outside git-tracked paths in production (`~/.openclaw/workspace/BOOKMARKS.md`)

---

## Current status

- ✅ Bridge + extension MVP are live
- ✅ Bookmark persistence + dedupe + Telegram acknowledgment implemented
- 🚧 macOS native client pending
