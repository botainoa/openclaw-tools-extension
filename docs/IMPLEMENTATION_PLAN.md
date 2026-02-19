# OpenClaw Tools Implementation Plan (MVP-first)

Generated: February 19, 2026  
Purpose: Detailed execution plan for building the first production-ready vertical slice of OpenClaw Tools.

## 1) Summary

Build a thin, end-to-end MVP first:

1. Chrome context-menu action (`summarize`)
2. Local bridge service (Fastify + TypeScript)
3. Forwarding to OpenClaw session
4. Immediate user-visible response in Telegram

This sequence de-risks the hardest part early (OpenClaw + Telegram delivery) before expanding to more actions or native macOS.

## 2) Decisions Already Made

- Bridge runtime: **Node.js + TypeScript + Fastify**
- First action to ship: **`summarize`**
- Payload baseline: `docs/PAYLOAD_SCHEMA.md` v1
- Security baseline: `docs/SECURITY.md`

## 3) Goals

- Deliver one reliable "right-click -> Telegram reply" flow.
- Keep contracts strict and shared across client and bridge.
- Establish baseline security on localhost traffic.
- Add enough observability to diagnose failures quickly.

## 4) Non-Goals for Initial MVP

- Native macOS client implementation
- Multi-action UI complexity in extension
- Advanced queueing infra
- Cloud deployment and multi-user tenancy

## 5) Assumptions

- OpenClaw endpoint/session (`agent:main:main`) is reachable from the bridge process.
- Telegram routing from OpenClaw is available for the same user session.
- Local bridge runs on the same machine as Chrome extension.
- No requirement yet for offline persistence beyond bounded retries.

## 6) Architecture and Data Flow

1. User right-clicks in Chrome and selects "Summarize with OpenClaw".
2. Extension background service worker builds request payload.
3. Extension sends signed request to bridge at localhost.
4. Bridge validates auth, timestamp, and payload schema.
5. Bridge forwards normalized action to OpenClaw.
6. OpenClaw sends final response to Telegram.
7. Bridge returns status to extension (`sent`, `queued`, or `failed`).

## 7) Contracts (v1)

### 7.1 Client -> Bridge API

- Method: `POST /v1/action`
- Headers:
  - `Content-Type: application/json`
  - `X-OpenClaw-Client-Key: <shared-secret>`
  - Optional future: `X-OpenClaw-Signature`
- Body shape (based on `docs/PAYLOAD_SCHEMA.md`):
  - `version` (required)
  - `action` (required; allowlist controlled)
  - `source` (required; `chrome|macos`)
  - `url` (optional)
  - `title` (optional)
  - `selection` (optional)
  - `userPrompt` (optional)
  - `tags` (optional)
  - `responseMode` (optional, default `telegram`)
  - `idempotencyKey` (optional)
  - `timestamp` (required)

Validation rules:

1. Reject unsupported action values.
2. Require at least one of `url`, `selection`, or `userPrompt`.
3. Enforce timestamp freshness window (for replay protection).
4. Enforce payload size caps (especially `selection`).
5. Return structured error codes for all rejections.

### 7.2 Bridge -> OpenClaw Contract

Define explicit contract now (transport can be HTTP/IPC later), minimum fields:

- `requestId` (bridge-generated UUID)
- `action`
- `source`
- `context` object (`url`, `title`, `selection`, `userPrompt`, `tags`)
- `responseMode`
- `timestamp`

Expected response:

- `status`: `sent | queued | failed`
- `requestId`
- `errorCode` (when failed)
- `retryAfterMs` (optional)

### 7.3 Canonical Action Naming

Use **`summarize`** as canonical internal action enum.

- UI labels may use "Summarise" if desired.
- Bridge should normalize aliases at input boundary to avoid drift.

## 8) Security Baseline (MVP)

Required on day 1:

1. Bind bridge to `127.0.0.1` only.
2. Validate `X-OpenClaw-Client-Key` against local secret.
3. Reject stale timestamps.
4. Enforce action allowlist.
5. Enforce body size limit and selection truncation/rejection policy.
6. Avoid logging full selection text by default.
7. Never place gateway/OpenClaw secrets in extension bundle.

## 9) Latency Targets (SLO-style)

Two metrics:

1. **Ack latency** (click -> bridge response): p95 <= 300ms
2. **Delivery latency** (click -> Telegram message): p50 <= 3s, p95 <= 10s

These are "fast enough to feel immediate" targets for MVP.

## 10) Repository Structure Proposal

```text
/
  bridge/
    src/
      index.ts
      routes/
        health.ts
        action.ts
      lib/
        auth.ts
        validation.ts
        forwarder.ts
        logger.ts
      types/
        action.ts
    test/
      action.spec.ts
  extension/
    manifest.json
    src/
      background.ts
      menu.ts
      api.ts
  docs/
    ARCHITECTURE.md
    PAYLOAD_SCHEMA.md
    SECURITY.md
    IMPLEMENTATION_PLAN.md
```

## 11) Phased Implementation Plan

### Phase 0: Spec Alignment (0.5 day)

Deliverables:

- Confirm canonical action enum (`summarize`, `explain`, `bookmark`, `prompt`)
- Add/confirm error code taxonomy in docs
- Finalize size limits and timestamp skew

Acceptance criteria:

- Payload and security docs contain no naming contradictions.

### Phase 1: Bridge Skeleton (1 day)

Deliverables:

- Fastify app with:
  - `GET /health`
  - `POST /v1/action`
- JSON schema validation and typed handlers
- Auth and timestamp checks
- Structured status/error responses

Acceptance criteria:

- Invalid requests are rejected with deterministic errors.
- Health endpoint returns stable response for local checks.

### Phase 2: OpenClaw Integration Spike (1 day)

Deliverables:

- `forwarder` adapter wired from bridge to OpenClaw
- Timeout and retry policy (bounded)
- Mapping of upstream errors to bridge error codes

Acceptance criteria:

- Manual test request produces Telegram response.
- Unavailable OpenClaw path yields `queued` or `failed` with clear reason.

### Phase 3: Chrome Extension MVP (1-2 days)

Deliverables:

- MV3 context-menu integration
- One action: `summarize`
- Payload assembly from page/link/selection context
- Local POST to bridge + notification feedback

Acceptance criteria:

- User can right-click and trigger end-to-end summarization.
- Extension surfaces success/failure state clearly.

### Phase 4: Reliability + Observability (1 day)

Deliverables:

- Request ID propagation across all layers
- Basic retry for transient forward failures
- Minimal structured logs and latency metrics

Acceptance criteria:

- Can trace any failed request from extension log to bridge log.
- Latency metrics available for ack/delivery monitoring.

### Phase 5: Additional Actions (1-2 days)

Deliverables:

- Add `bookmark`, `explain`, then `prompt`
- Add bookmark persistence policy for `BOOKMARKS.md`
- Add idempotency handling for bookmark writes

Acceptance criteria:

- No duplicate bookmark writes on retry scenarios.
- Action-specific validation rules enforced.

### Phase 6: macOS Planning and Build (later)

Deliverables:

- Swift app architecture and permission model
- Selection capture flow and prompt entry UI
- Reuse same bridge contract

Acceptance criteria:

- macOS client passes same bridge contract tests as Chrome client.

## 12) Error Codes (Recommended v1 Set)

- `UNAUTHORIZED_CLIENT`
- `STALE_TIMESTAMP`
- `INVALID_PAYLOAD`
- `UNSUPPORTED_ACTION`
- `PAYLOAD_TOO_LARGE`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_UNAVAILABLE`
- `INTERNAL_ERROR`

## 13) Testing and Validation Plan

Unit tests:

- Auth validator
- Timestamp freshness check
- Payload schema edge cases
- Action normalization and allowlist

Integration tests:

- `POST /v1/action` valid path -> expected status
- Invalid headers/body -> expected error codes
- OpenClaw timeout path -> `UPSTREAM_TIMEOUT`

Manual E2E tests:

1. Page context summarize from right-click menu
2. Selected text summarize from right-click menu
3. OpenClaw down scenario
4. Invalid secret scenario

## 14) Rollout and Monitoring

- Start local developer-only rollout.
- Capture:
  - Request count by action
  - Error rate by code
  - Ack latency percentiles
  - Delivery latency percentiles (if observable)
- Gate expansion to new actions until error rate and latency are stable.

## 15) Risks and Mitigations

- Integration uncertainty with OpenClaw routing
  - Mitigation: complete Phase 2 before extension polish.
- Local security regressions
  - Mitigation: enforce auth and freshness from first commit.
- Contract drift across clients
  - Mitigation: shared schemas/types and contract tests.
- UX mismatch on "immediate" expectation
  - Mitigation: instrument latency and expose fallback status messages.

## 16) Definition of Done for MVP

MVP is done when all are true:

1. User can trigger summarize from Chrome context menu.
2. Bridge validates/authenticates and forwards request.
3. Telegram reply arrives within target latency in normal conditions.
4. Failures produce clear client-visible status and actionable logs.
5. Minimal tests cover auth/validation/forwarding critical paths.

## 17) Next-Session Kickoff Checklist

Use this exact sequence in a new chat:

1. Implement Phase 1 bridge skeleton (`/health`, `/v1/action`) in Fastify.
2. Add schema validation and error-code responses.
3. Create a stub forwarder that simulates OpenClaw responses.
4. Add unit tests for auth + timestamp + schema failures.
5. Verify local run path and record sample request/response.

When opening the next chat, reference this file directly: `docs/IMPLEMENTATION_PLAN.md`.
