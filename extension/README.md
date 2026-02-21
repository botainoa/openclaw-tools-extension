# OpenClaw Chrome Extension (Private MVP)

Manifest V3 extension that sends context-menu actions to the OpenClaw bridge.

## Implemented

- Context menu actions:
  - `Summarize with OpenClaw`
  - `Explain with OpenClaw`
  - `Bookmark in OpenClaw`
  - `Custom Prompt with OpenClaw`
- Options page for:
  - Bridge URL
  - Client key (`X-OpenClaw-Client-Key`)
  - Response mode (`telegram|silent|both`)
  - Request timeout
- Bridge health check (`GET /health`) from options page
- Last bridge result panel in options (`status`, `requestId`, `error`, `message`, timestamp)
- In-page prompt textarea modal for custom prompt submission
- Popup prompt window fallback for restricted pages where script injection is blocked

## Load unpacked

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `extension/` folder.

## Configure

1. Open extension details and click `Extension options`.
2. Set:
   - `Bridge URL` (for VPS/tunnel URL)
   - `Client Key` (same value as bridge `OPENCLAW_CLIENT_KEY`)
3. Click `Save Settings`.
4. Click `Test Bridge Health` and confirm healthy response.

## Usage

1. Right-click on a page, selected text, or link.
2. Pick an OpenClaw action.
3. For `Custom Prompt`, enter prompt text in the in-page modal and send.
4. On restricted pages (for example `chrome://` pages), a popup fallback is used.
5. `Bookmark in OpenClaw` writes a Markdown entry to server-side `BOOKMARKS.md` (recommended server path: `~/.openclaw/workspace/BOOKMARKS.md`).
6. Wait for Telegram response from OpenClaw for summarize/explain/prompt actions.

## Notes

- This extension is intentionally private and currently uses shared-key auth.
- No offline queueing is implemented; internet/bridge access is required.
- Selection is capped client-side to match bridge validation limits.
