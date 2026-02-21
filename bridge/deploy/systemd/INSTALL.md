# systemd Install Guide (Bridge)

Use this guide to run the bridge as a persistent service on a Linux VPS.

## 1) Prerequisites

- Linux host with `systemd`
- Node.js and npm installed
- Bridge repository cloned
- `bridge/.env` created with real values (never commit `.env`)
- OpenClaw running on the same host as this bridge service

## 2) Build bridge once

```bash
cd <repo>/bridge
npm install
npm run build
```

## 3) Install unit file

```bash
sudo cp <repo>/bridge/deploy/systemd/openclaw-bridge.service.example /etc/systemd/system/openclaw-bridge.service
sudo editor /etc/systemd/system/openclaw-bridge.service
```

Replace placeholders in the unit file:

- `<linux-user>`
- `<absolute-path-to-repo>`

## 4) Enable and start service

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-bridge
sudo systemctl status openclaw-bridge
```

## 5) Useful operations

```bash
# follow logs
sudo journalctl -u openclaw-bridge -f

# restart after code/config changes
sudo systemctl restart openclaw-bridge

# stop/start manually
sudo systemctl stop openclaw-bridge
sudo systemctl start openclaw-bridge
```

## 6) Update flow after pulling new code

```bash
cd <repo>/bridge
npm install
npm run build
sudo systemctl restart openclaw-bridge
```

## Optional: user-level systemd (no sudo)

If you cannot use `sudo` yet, you can run the bridge as a user service:

```bash
mkdir -p ~/.config/systemd/user
cp <repo>/bridge/deploy/systemd/openclaw-bridge.service.example ~/.config/systemd/user/openclaw-bridge.service
# edit service file for user mode:
# - remove User=/Group= lines
# - set WantedBy=default.target
# - replace <absolute-path-to-repo>
systemctl --user daemon-reload
systemctl --user enable --now openclaw-bridge
systemctl --user status openclaw-bridge
```

## Notes

- Keep bridge bound to localhost (`127.0.0.1`) and expose externally via Tailscale Serve or SSH tunnel.
- Keep `bridge/.env` permissions restricted (for example: `chmod 600 .env`).
- Do not put secrets in unit files or git-tracked files.
- For Node.js services, keep `MemoryDenyWriteExecute=false` (V8 JIT requires executable memory mappings).
- In `bridge/.env`, set `OPENCLAW_CLI_PATH` explicitly when using Telegram relay under systemd.
