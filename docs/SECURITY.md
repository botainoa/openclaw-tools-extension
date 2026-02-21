# Security

## Trust model

- Bridge is a **private control plane** for trusted clients you operate.
- OpenClaw credentials stay server-side; clients only hold bridge client key.
- Bridge should run on the same host as OpenClaw.

## Current enforced controls

1. **Bridge bind scope**
   - Runs on localhost (`127.0.0.1`) and should be exposed only via trusted transport (SSH tunnel or Tailscale).

2. **Client authentication**
   - Requires `X-OpenClaw-Client-Key`.
   - Rejects unauthorized requests with `UNAUTHORIZED_CLIENT`.

3. **Replay protection**
   - Requires request `timestamp`.
   - Rejects stale timestamps (`STALE_TIMESTAMP`).

4. **Strict action allowlist**
   - `bookmark`, `summarize`, `explain`, `prompt`.

5. **Payload validation and limits**
   - Strict schema (`additionalProperties: false`).
   - Selection length cap enforced.

6. **Secret isolation**
   - OpenClaw token remains in bridge `.env` only.
   - Never exposed to extension code.

7. **Logging policy**
   - Logs metadata (requestId/action/source/status/latency), not full selection text by default.

8. **Bookmark dedupe safety**
   - Retry dedupe via `idempotencyKey`.
   - URL dedupe via canonical URL matching.

## Operational hardening checklist

- Use a strong random `OPENCLAW_CLIENT_KEY`.
- Set restrictive file permissions:
  - `chmod 600 bridge/.env`
  - `chmod 600 ~/.openclaw/workspace/BOOKMARKS.md`
- Configure explicit `OPENCLAW_CLI_PATH` in `.env` when running under systemd.
- Keep bridge behind tailnet or SSH tunnel; do not expose unauthenticated public endpoints.

## Data handling notes

- `BOOKMARKS.md` should contain only user-intended bookmark metadata.
- Summarize/explain payload text is not persisted to bookmarks.
- Consider adding optional local redaction for sensitive selected text in future clients.

## Recommended next controls (future)

- Per-client rate limiting.
- Optional request signing (HMAC) in addition to shared key.
- Optional audit stream for repeated failed auth attempts.
