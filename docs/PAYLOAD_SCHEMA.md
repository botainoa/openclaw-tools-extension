# Payload Schema (v1)

Shared request contract for Chrome extension clients.

## Request body

```json
{
  "version": "1",
  "action": "bookmark|summarize|explain|flashcards|prompt",
  "source": "chrome",
  "url": "https://example.com",
  "title": "Page title",
  "selection": "optional selected text",
  "userPrompt": "optional custom prompt",
  "tags": ["optional", "bookmark-tags"],
  "responseMode": "telegram|silent|both",
  "idempotencyKey": "optional-uuid",
  "timestamp": "2026-02-19T21:50:00Z"
}
```

## Required headers

- `Content-Type: application/json`
- `X-OpenClaw-Client-Key: <shared-secret>`

## Field notes

- `version` (required): currently `"1"`.
- `action` (required): requested operation.
- `source` (required): origin surface (`chrome`).
- `url` (optional but recommended): page/document link.
- `title` (optional): display title.
- `selection` (optional): highlighted text.
- `userPrompt` (optional): required when `action="prompt"`.
- `tags` (optional): mostly used by bookmark action.
- `responseMode` (optional): forwarded for non-bookmark actions; default is client-controlled (extension defaults to `telegram`).
- `idempotencyKey` (optional): retry dedupe key.
- `timestamp` (required): replay protection.

## Validation rules (current)

1. Reject unknown `action` values.
2. Reject unknown top-level fields (strict body schema).
3. Require at least one of: `url`, `selection`, or `userPrompt`.
4. For `prompt`, require non-empty `userPrompt`.
5. Enforce selection max length (currently 20k chars).
6. Reject stale timestamps beyond allowed skew window.

## Response body

```json
{
  "status": "sent|queued|failed",
  "requestId": "uuid",
  "errorCode": "optional",
  "retryAfterMs": 5000
}
```

### Status semantics

- `sent`: request accepted and processed for this stage.
- `queued`: transient upstream timeout path.
- `failed`: validation/auth/internal/upstream failure.

## Known behavior notes

- `bookmark` is handled directly by bridge storage path (`BOOKMARKS.md`) and does not require OpenClaw chat completion.
- `flashcards` is forwarded to OpenClaw and persisted to bridge storage path (`FLASHCARDS.md`).
- URL duplicates for bookmarks are deduped using canonical URL matching.
