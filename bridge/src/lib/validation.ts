import { ALLOWED_ACTIONS, type ActionRequest } from "../types/action.js";

const MAX_SELECTION_CHARS = 20000;
const MAX_SKEW_MS = 5 * 60 * 1000;

export function validateTimestamp(iso: string): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) <= MAX_SKEW_MS;
}

export function validatePayload(body: Partial<ActionRequest>): { ok: boolean; reason?: string } {
  if (!body.version || !body.action || !body.source || !body.timestamp) return { ok: false, reason: "missing_required_fields" };
  if (!ALLOWED_ACTIONS.includes(body.action as any)) return { ok: false, reason: "unsupported_action" };
  if (body.source !== "chrome" && body.source !== "macos") return { ok: false, reason: "invalid_source" };
  if (!body.url && !body.selection && !body.userPrompt) return { ok: false, reason: "empty_context" };
  if (body.action === "prompt" && !body.userPrompt) return { ok: false, reason: "missing_user_prompt" };
  if (body.selection && body.selection.length > MAX_SELECTION_CHARS) return { ok: false, reason: "payload_too_large" };
  if (!validateTimestamp(body.timestamp)) return { ok: false, reason: "stale_timestamp" };
  return { ok: true };
}
