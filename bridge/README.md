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
export OPENCLAW_CLIENT_KEY=dev-secret
npm run dev
```

To enable forwarding to OpenClaw (Phase 2), also set:

- `OPENCLAW_BASE_URL`
- `OPENCLAW_TOKEN`
- `OPENCLAW_SESSION_KEY` (optional, defaults to `agent:main:main`)

## Behavior

- `sent` -> HTTP 200
- `queued` -> HTTP 202 (timeout path)
- `failed` -> HTTP 502 (upstream unavailable/error)
