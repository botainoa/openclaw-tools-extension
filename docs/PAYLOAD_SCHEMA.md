# Payload Schema (v1)

Shared request contract for Chrome + macOS clients.

```json
{
  "version": "1",
  "action": "bookmark|summarize|explain|prompt",
  "source": "chrome|macos",
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

## Field notes

- `action` (required): requested operation.
- `source` (required): origin surface.
- `url` (optional but recommended): page/document link.
- `title` (optional): display title.
- `selection` (optional): highlighted text.
- `userPrompt` (optional): only required for `prompt` action.
- `tags` (optional): used mainly for bookmarks.
- `responseMode` (optional): default `telegram`.
- `idempotencyKey` (optional): dedupe support for retries.
- `timestamp` (required): request freshness and replay protection.

## Validation rules

1. Reject unknown `action` values.
2. Require at least one of: `url`, `selection`, or `userPrompt`.
3. For `prompt`, require `userPrompt`.
4. Enforce selection length cap (implementation-defined, e.g. 20k chars).
5. Reject stale timestamps beyond allowed skew.
