const ACTION_ALIASES = {
  summarise: "summarize"
};

export const PAYLOAD_LIMITS = {
  maxSelectionChars: 20000
};

function cleanText(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAction(action) {
  if (typeof action !== "string") return "";
  const normalized = action.trim().toLowerCase();
  return ACTION_ALIASES[normalized] || normalized;
}

export function buildPayload(input) {
  const action = normalizeAction(input.action);
  const url = cleanText(input.url);
  const title = cleanText(input.title);
  const selection = cleanText(input.selection);
  const userPrompt = cleanText(input.userPrompt);

  if (!action) {
    return { ok: false, reason: "Missing action." };
  }

  if (selection && selection.length > PAYLOAD_LIMITS.maxSelectionChars) {
    return {
      ok: false,
      reason: `Selected text is too long (max ${PAYLOAD_LIMITS.maxSelectionChars} characters).`
    };
  }

  if (!url && !selection && !userPrompt) {
    return {
      ok: false,
      reason: "Missing context. Include a page/link URL, selected text, or custom prompt."
    };
  }

  if (action === "prompt" && !userPrompt) {
    return { ok: false, reason: "Prompt action requires custom text." };
  }

  const payload = {
    version: "1",
    action,
    source: "chrome",
    timestamp: new Date().toISOString(),
    idempotencyKey: crypto.randomUUID()
  };

  if (url) payload.url = url;
  if (title) payload.title = title;
  if (selection) payload.selection = selection;
  if (userPrompt) payload.userPrompt = userPrompt;

  if (Array.isArray(input.tags) && input.tags.length > 0) {
    payload.tags = input.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (input.responseMode) {
    payload.responseMode = input.responseMode;
  }

  return { ok: true, payload };
}
