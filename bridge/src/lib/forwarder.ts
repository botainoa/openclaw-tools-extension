import type { ActionRequest, BridgeResponse } from "../types/action.js";

const DEFAULT_TIMEOUT_MS = 6000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function buildActionMessage(req: ActionRequest, requestId: string): string {
  return [
    "OpenClaw Tools action request:",
    JSON.stringify({
      requestId,
      action: req.action,
      source: req.source,
      context: {
        url: req.url,
        title: req.title,
        selection: req.selection,
        userPrompt: req.userPrompt,
        tags: req.tags ?? []
      },
      responseMode: req.responseMode ?? "telegram",
      timestamp: req.timestamp
    })
  ].join("\n");
}

export async function forwardToOpenClaw(
  req: ActionRequest,
  requestId: string,
  deps: { fetchFn?: FetchLike } = {}
): Promise<BridgeResponse> {
  const baseUrl = process.env.OPENCLAW_BASE_URL;
  const token = process.env.OPENCLAW_TOKEN;
  const sessionKey = process.env.OPENCLAW_SESSION_KEY ?? "agent:main:main";
  const timeoutMs = Number(process.env.OPENCLAW_FORWARD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  if (!baseUrl || !token) {
    return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(`${normalizeBaseUrl(baseUrl)}/api/sessions/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionKey,
        message: buildActionMessage(req, requestId)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        status: "failed",
        requestId,
        errorCode: response.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR"
      };
    }

    return { status: "sent", requestId };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "queued",
        requestId,
        errorCode: "UPSTREAM_TIMEOUT",
        retryAfterMs: 5000
      };
    }

    return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}
