export const ALLOWED_ACTIONS = ["summarize", "explain", "flashcards", "bookmark", "prompt"] as const;
export type ActionType = (typeof ALLOWED_ACTIONS)[number];

export type ActionRequest = {
  version: string;
  action: string;
  source: "chrome";
  url?: string;
  title?: string;
  selection?: string;
  userPrompt?: string;
  tags?: string[];
  responseMode?: "telegram" | "silent" | "both";
  idempotencyKey?: string;
  timestamp: string;
};

export type BridgeResponse = {
  status: "sent" | "queued" | "failed";
  requestId: string;
  errorCode?:
    | "UNAUTHORIZED_CLIENT"
    | "STALE_TIMESTAMP"
    | "INVALID_PAYLOAD"
    | "UNSUPPORTED_ACTION"
    | "PAYLOAD_TOO_LARGE"
    | "UPSTREAM_TIMEOUT"
    | "UPSTREAM_UNAVAILABLE"
    | "INTERNAL_ERROR";
  retryAfterMs?: number;
};
