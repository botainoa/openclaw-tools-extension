import { ALLOWED_ACTIONS, type ActionRequest } from "../types/action.js";

const MAX_SELECTION_CHARS = 20000;
const MAX_SKEW_MS = 5 * 60 * 1000;

export type ValidationReason =
  | "missing_required_fields"
  | "unsupported_action"
  | "invalid_source"
  | "invalid_response_mode"
  | "empty_context"
  | "missing_user_prompt"
  | "payload_too_large"
  | "stale_timestamp";

type ValidPayloadResult = { ok: true; payload: ActionRequest };
type InvalidPayloadResult = { ok: false; reason: ValidationReason };

const ACTION_ALIASES: Record<string, string> = {
  summarise: "summarize"
};

function normalizeAction(action: string): string {
  const normalized = action.trim().toLowerCase();
  return ACTION_ALIASES[normalized] ?? normalized;
}

export function validateTimestamp(iso: string): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= MAX_SKEW_MS;
}

function normalizePayload(body: Partial<ActionRequest>): Partial<ActionRequest> {
  const action = typeof body.action === "string" ? normalizeAction(body.action) : body.action;
  const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.trim() : body.userPrompt;

  return {
    ...body,
    action,
    userPrompt
  };
}

export function validatePayload(body: Partial<ActionRequest>): ValidPayloadResult | InvalidPayloadResult {
  const normalized = normalizePayload(body);
  const action = normalized.action;
  const source = normalized.source;
  const responseMode = normalized.responseMode;
  const userPrompt = normalized.userPrompt;

  if (!normalized.version || !action || !source || !normalized.timestamp) {
    return { ok: false, reason: "missing_required_fields" };
  }

  if (!ALLOWED_ACTIONS.includes(action as any)) {
    return { ok: false, reason: "unsupported_action" };
  }

  if (source !== "chrome") {
    return { ok: false, reason: "invalid_source" };
  }

  if (responseMode && responseMode !== "telegram" && responseMode !== "silent" && responseMode !== "both") {
    return { ok: false, reason: "invalid_response_mode" };
  }

  if (!normalized.url && !normalized.selection && !userPrompt) {
    return { ok: false, reason: "empty_context" };
  }

  if (action === "prompt" && !userPrompt) {
    return { ok: false, reason: "missing_user_prompt" };
  }

  if (normalized.selection && normalized.selection.length > MAX_SELECTION_CHARS) {
    return { ok: false, reason: "payload_too_large" };
  }

  if (!validateTimestamp(normalized.timestamp)) {
    return { ok: false, reason: "stale_timestamp" };
  }

  return { ok: true, payload: normalized as ActionRequest };
}
