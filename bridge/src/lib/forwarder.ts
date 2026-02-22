import type { ActionRequest, BridgeResponse } from "../types/action.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendBookmark, type BookmarkAppendResult } from "./bookmarks.js";
import { appendFlashcards, type FlashcardsAppendResult } from "./flashcards.js";

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_RETRIES = 1;
const BASE_RETRY_DELAY_MS = 200;
const DEFAULT_MODEL = "openclaw:main";
const DEFAULT_SESSION_KEY = "agent:main:main";
const DEFAULT_TELEGRAM_CHANNEL = "telegram";
const DEFAULT_TELEGRAM_SEND_TIMEOUT_MS = 8000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type TelegramSendFn = (params: { channel: string; target: string; message: string; timeoutMs: number }) => Promise<void>;
type BookmarkAppendFn = (req: ActionRequest, requestId: string) => Promise<BookmarkAppendResult>;
type FlashcardsAppendFn = (req: ActionRequest, requestId: string, cardsText: string) => Promise<FlashcardsAppendResult>;

const execFileAsync = promisify(execFile);

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugForwarderLog(message: string, details?: Record<string, unknown>): void {
  if (process.env.OPENCLAW_FORWARD_DEBUG !== "1") return;
  if (details) {
    console.error(`[openclaw-forwarder] ${message}`, details);
    return;
  }
  console.error(`[openclaw-forwarder] ${message}`);
}

function buildActionMessage(req: ActionRequest, requestId: string): string {
  return [
    "RightClaw action request:",
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

function buildBookmarkAckMessage(req: ActionRequest, result: BookmarkAppendResult): string {
  const title = req.title?.trim() || "Untitled";
  const url = req.url?.trim();
  const prefix = result.deduped && result.reason === "url" ? "🔖 Already bookmarked" : "🔖 Saved bookmark";

  if (url) {
    return `${prefix}: ${title}\n${url}`;
  }

  return `${prefix}: ${title}`;
}

function buildFlashcardsAckMessage(req: ActionRequest, result: FlashcardsAppendResult): string {
  const title = req.title?.trim() || "Untitled";
  const url = req.url?.trim();
  const prefix = result.deduped ? "🧠 Flashcards already saved" : "🧠 Flashcards saved";

  if (url) {
    return `${prefix}: ${title}\n${url}\nSay "quiz me on this" anytime.`;
  }

  return `${prefix}: ${title}\nSay "quiz me on this" anytime.`;
}

function extractCompletionText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("choices" in payload)) return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) return null;
  const message = (firstChoice as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part) {
          const value = (part as { text?: unknown }).text;
          return typeof value === "string" ? value : "";
        }
        return "";
      })
      .join("")
      .trim();
    return text || null;
  }

  return null;
}

async function sendTelegramViaCli(params: {
  channel: string;
  target: string;
  message: string;
  timeoutMs: number;
}): Promise<void> {
  const command = process.env.OPENCLAW_CLI_PATH || "openclaw";
  await execFileAsync(
    command,
    ["message", "send", "--channel", params.channel, "--target", params.target, "--message", params.message],
    { timeout: params.timeoutMs, maxBuffer: 1024 * 1024 }
  );
}

async function forwardViaChatCompletionsOnce(
  req: ActionRequest,
  requestId: string,
  config: {
    baseUrl: string;
    token: string;
    sessionKey: string;
    model: string;
    timeoutMs: number;
    agentId?: string;
    telegramTarget?: string;
    telegramChannel: string;
    telegramSendTimeoutMs: number;
  },
  deps: { fetchFn?: FetchLike; telegramSendFn?: TelegramSendFn; flashcardsAppendFn?: FlashcardsAppendFn } = {}
): Promise<BridgeResponse> {
  const fetchFn = deps.fetchFn ?? fetch;
  const telegramSendFn = deps.telegramSendFn ?? sendTelegramViaCli;
  const flashcardsAppendFn = deps.flashcardsAppendFn ?? appendFlashcards;
  const upstreamUrl = `${normalizeBaseUrl(config.baseUrl)}/v1/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.token}`
  };
  headers["x-openclaw-session-key"] = config.sessionKey;
  if (config.agentId) {
    headers["x-openclaw-agent-id"] = config.agentId;
  }

  const body = JSON.stringify({
    model: config.model,
    messages: [
      {
        role: "user",
        content: buildActionMessage(req, requestId)
      }
    ],
    stream: false
  });

  try {
    const response = await fetchFn(upstreamUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    if (response.ok) {
      const needsCompletionText = Boolean(config.telegramTarget) || req.action === "flashcards";
      let completionText: string | null = null;

      if (needsCompletionText) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
        }

        completionText = extractCompletionText(payload);
        if (!completionText) {
          return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
        }
      }

      if (req.action === "flashcards") {
        if (!completionText) {
          return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
        }

        let flashcardsResult: FlashcardsAppendResult;
        try {
          flashcardsResult = await flashcardsAppendFn(req, requestId, completionText);
        } catch (error) {
          debugForwarderLog("flashcards append failed", {
            message: error instanceof Error ? error.message : String(error)
          });
          return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
        }

        if (config.telegramTarget) {
          void telegramSendFn({
            channel: config.telegramChannel,
            target: config.telegramTarget,
            message: buildFlashcardsAckMessage(req, flashcardsResult),
            timeoutMs: config.telegramSendTimeoutMs
          }).catch((error) => {
            debugForwarderLog("flashcards telegram ack failed", {
              message: error instanceof Error ? error.message : String(error)
            });
          });
        }

        return { status: "sent", requestId };
      }

      if (config.telegramTarget) {
        if (!completionText) {
          return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
        }

        try {
          await telegramSendFn({
            channel: config.telegramChannel,
            target: config.telegramTarget,
            message: completionText,
            timeoutMs: config.telegramSendTimeoutMs
          });
        } catch (error) {
          debugForwarderLog("telegram send failed", {
            message: error instanceof Error ? error.message : String(error)
          });
          return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
        }
      }

      return { status: "sent", requestId };
    }

    const statusCode = response.status;
    const isRetryable = statusCode === 408 || statusCode === 429 || statusCode >= 500;
    debugForwarderLog("chat completions rejected", { statusCode, isRetryable });
    return {
      status: "failed",
      requestId,
      errorCode: isRetryable ? "UPSTREAM_UNAVAILABLE" : "INTERNAL_ERROR"
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      debugForwarderLog("chat completions timeout", { timeoutMs: config.timeoutMs });
      return {
        status: "queued",
        requestId,
        errorCode: "UPSTREAM_TIMEOUT",
        retryAfterMs: 5000
      };
    }

    debugForwarderLog("chat completions request failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function forwardToOpenClaw(
  req: ActionRequest,
  requestId: string,
  deps: {
    fetchFn?: FetchLike;
    telegramSendFn?: TelegramSendFn;
    bookmarkAppendFn?: BookmarkAppendFn;
    flashcardsAppendFn?: FlashcardsAppendFn;
  } = {}
): Promise<BridgeResponse> {
  const telegramTarget = process.env.OPENCLAW_TELEGRAM_TARGET;
  const telegramChannel = process.env.OPENCLAW_TELEGRAM_CHANNEL ?? DEFAULT_TELEGRAM_CHANNEL;
  const telegramSendTimeoutMs = Number(process.env.OPENCLAW_TELEGRAM_SEND_TIMEOUT_MS ?? DEFAULT_TELEGRAM_SEND_TIMEOUT_MS);

  if (req.action === "bookmark") {
    try {
      const appendFn = deps.bookmarkAppendFn ?? appendBookmark;
      const result = await appendFn(req, requestId);

      const shouldSendAck = !result.deduped || result.reason === "url";

      if (telegramTarget && shouldSendAck) {
        const telegramSendFn = deps.telegramSendFn ?? sendTelegramViaCli;
        void telegramSendFn({
          channel: telegramChannel,
          target: telegramTarget,
          message: buildBookmarkAckMessage(req, result),
          timeoutMs: telegramSendTimeoutMs
        }).catch((error) => {
          debugForwarderLog("bookmark telegram ack failed", {
            message: error instanceof Error ? error.message : String(error)
          });
        });
      }

      return { status: "sent", requestId };
    } catch (error) {
      debugForwarderLog("bookmark append failed", {
        message: error instanceof Error ? error.message : String(error)
      });
      return { status: "failed", requestId, errorCode: "INTERNAL_ERROR" };
    }
  }

  const baseUrl = process.env.OPENCLAW_BASE_URL;
  const token = process.env.OPENCLAW_TOKEN;
  const sessionKey = process.env.OPENCLAW_SESSION_KEY ?? DEFAULT_SESSION_KEY;
  const model = process.env.OPENCLAW_MODEL ?? DEFAULT_MODEL;
  const agentId = process.env.OPENCLAW_AGENT_ID;
  const timeoutMs = Number(process.env.OPENCLAW_FORWARD_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxRetries = Number(process.env.OPENCLAW_FORWARD_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);

  if (!baseUrl || !token) {
    return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await forwardViaChatCompletionsOnce(
      req,
      requestId,
      {
        baseUrl,
        token,
        sessionKey,
        model,
        timeoutMs,
        agentId,
        telegramTarget,
        telegramChannel,
        telegramSendTimeoutMs
      },
      {
        fetchFn: deps.fetchFn,
        telegramSendFn: deps.telegramSendFn,
        flashcardsAppendFn: deps.flashcardsAppendFn
      }
    );

    if (response.status === "sent") {
      return response;
    }

    if ((response.errorCode === "UPSTREAM_UNAVAILABLE" || response.errorCode === "UPSTREAM_TIMEOUT") && attempt < maxRetries) {
      await wait(BASE_RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    return response;
  }

  return { status: "failed", requestId, errorCode: "UPSTREAM_UNAVAILABLE" };
}
