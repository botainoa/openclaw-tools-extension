# Security

## Principles

- User-triggered actions only (no passive scraping)
- Least privilege
- Local-first trust boundary
- Explicit auth between clients and bridge

## Bridge hardening requirements

1. Bind bridge to `127.0.0.1` by default.
2. Require client auth header (e.g., `X-OpenClaw-Client-Key`).
3. Require request timestamp and reject stale requests.
4. Enforce action allowlist (`bookmark`, `summarize`, `explain`, `prompt`).
5. Enforce payload size limits (especially selected text).
6. Validate payload against schema before forwarding.
7. Never expose OpenClaw/Gateway tokens to extension code.
8. Log minimal metadata only (no sensitive full-text by default).

## Secret handling

- Store bridge secret in local secure config (not in repo).
- Do not hardcode tokens in extension/app bundles.
- Rotate shared client secret if compromised.

## Data safety

- `BOOKMARKS.md` should contain only user-intended saved metadata.
- Summarize/Explain payloads should not be stored unless explicitly needed.
- Consider optional redaction/truncation for sensitive selections.

## Abuse prevention

- Add per-client rate limiting.
- Add idempotency key support to avoid duplicate bookmark writes.
- Reject unsupported actions with clear error messages.
