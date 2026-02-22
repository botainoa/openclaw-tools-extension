import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToOpenClaw } from "../src/lib/forwarder.js";
import type { ActionRequest } from "../src/types/action.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function makeRequest(): ActionRequest {
  return {
    version: "1",
    action: "summarize",
    source: "chrome",
    url: "https://example.com",
    timestamp: new Date().toISOString()
  };
}

describe("forwardToOpenClaw", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_BASE_URL;
    delete process.env.OPENCLAW_TOKEN;
    delete process.env.OPENCLAW_SESSION_KEY;
    delete process.env.OPENCLAW_MODEL;
    delete process.env.OPENCLAW_AGENT_ID;
    delete process.env.OPENCLAW_FORWARD_TIMEOUT_MS;
    delete process.env.OPENCLAW_FORWARD_MAX_RETRIES;
    delete process.env.OPENCLAW_FORWARD_DEBUG;
    delete process.env.OPENCLAW_TELEGRAM_TARGET;
    delete process.env.OPENCLAW_TELEGRAM_CHANNEL;
    delete process.env.OPENCLAW_TELEGRAM_SEND_TIMEOUT_MS;
    delete process.env.OPENCLAW_CLI_PATH;
    delete process.env.OPENCLAW_BOOKMARKS_PATH;
    delete process.env.OPENCLAW_FLASHCARDS_PATH;
  });

  it("stores bookmark actions in BOOKMARKS.md and sends Telegram ack by default", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";
    process.env.OPENCLAW_TELEGRAM_CHANNEL = "telegram";

    const fetchMock = vi.fn();
    const telegramSendFn = vi.fn().mockResolvedValue(undefined);
    const res = await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "bookmark",
        title: "Deep work article",
        tags: ["Productivity", "Deep Work"],
        selection: "A short highlighted note.",
        idempotencyKey: "bookmark-1"
      },
      "r-bookmark-1",
      { fetchFn: fetchMock, telegramSendFn }
    );

    expect(res).toEqual({ status: "sent", requestId: "r-bookmark-1" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
    expect(telegramSendFn).toHaveBeenCalledWith({
      channel: "telegram",
      target: "telegram-target",
      message: "🔖 Saved bookmark: Deep work article\nhttps://example.com",
      timeoutMs: 8000
    });

    const content = await readFile(bookmarksPath, "utf8");
    expect(content).toContain("# BOOKMARKS");
    expect(content).toContain("[Deep work article](<https://example.com>)");
    expect(content).toContain("source: chrome");
    expect(content).toContain("#productivity #deep-work");
    expect(content).toContain("idempotencyKey: bookmark-1");
  });

  it("returns quickly for bookmark even when Telegram ack is slow", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";

    const telegramSendFn = vi.fn(
      () =>
        new Promise<void>(() => {
          // Intentionally never resolves; bookmark save path must not block on this.
        })
    );

    const startedAt = Date.now();
    const res = await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "bookmark",
        title: "Non-blocking ack",
        idempotencyKey: "bookmark-non-blocking-1"
      },
      "r-bookmark-non-blocking",
      { telegramSendFn }
    );
    const elapsedMs = Date.now() - startedAt;

    expect(res).toEqual({ status: "sent", requestId: "r-bookmark-non-blocking" });
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(500);
  });

  it("deduplicates bookmark writes by idempotency key and avoids duplicate Telegram acks", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";

    const telegramSendFn = vi.fn().mockResolvedValue(undefined);

    const bookmarkReq: ActionRequest = {
      ...makeRequest(),
      action: "bookmark",
      title: "Same URL twice",
      idempotencyKey: "bookmark-dedupe-1"
    };

    const first = await forwardToOpenClaw(bookmarkReq, "r-bookmark-2", { telegramSendFn });
    const second = await forwardToOpenClaw(bookmarkReq, "r-bookmark-3", { telegramSendFn });

    expect(first.status).toBe("sent");
    expect(second.status).toBe("sent");

    const content = await readFile(bookmarksPath, "utf8");
    const dedupeMatches = content.match(/idempotencyKey: bookmark-dedupe-1/g) ?? [];
    expect(dedupeMatches).toHaveLength(1);
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
  });

  it("deduplicates same canonical URL and sends already-bookmarked ack", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";

    const telegramSendFn = vi.fn().mockResolvedValue(undefined);

    await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "bookmark",
        url: "https://example.com/path/?utm_source=newsletter#section",
        title: "Canonical URL test",
        idempotencyKey: "bookmark-url-a"
      },
      "r-bookmark-url-a",
      { telegramSendFn }
    );

    await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "bookmark",
        url: "https://example.com/path",
        title: "Canonical URL test",
        idempotencyKey: "bookmark-url-b"
      },
      "r-bookmark-url-b",
      { telegramSendFn }
    );

    const content = await readFile(bookmarksPath, "utf8");
    expect(content).toContain("idempotencyKey: bookmark-url-a");
    expect(content).not.toContain("idempotencyKey: bookmark-url-b");

    expect(telegramSendFn).toHaveBeenCalledTimes(2);
    expect(telegramSendFn.mock.calls[1]?.[0]?.message).toContain("🔖 Already bookmarked:");
  });

  it("keeps bookmark save successful even if Telegram ack fails", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";

    const telegramSendFn = vi.fn().mockRejectedValue(new Error("telegram down"));

    const res = await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "bookmark",
        title: "Still saved",
        idempotencyKey: "bookmark-ack-fail"
      },
      "r-bookmark-ack-fail",
      { telegramSendFn }
    );

    expect(res).toEqual({ status: "sent", requestId: "r-bookmark-ack-fail" });

    const content = await readFile(bookmarksPath, "utf8");
    expect(content).toContain("idempotencyKey: bookmark-ack-fail");
  });

  it("stores flashcards output in FLASHCARDS.md and relays to Telegram", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";

    const tempDir = await mkdtemp(path.join(tmpdir(), "rightclaw-flashcards-"));
    const flashcardsPath = path.join(tempDir, "FLASHCARDS.md");
    process.env.OPENCLAW_FLASHCARDS_PATH = flashcardsPath;

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Q1: A?\nA1: B." } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const telegramSendFn = vi.fn().mockResolvedValue(undefined);

    const res = await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "flashcards",
        title: "Flashcards topic",
        idempotencyKey: "flashcards-1"
      },
      "r-flashcards-1",
      { fetchFn: fetchMock, telegramSendFn }
    );

    expect(res).toEqual({ status: "sent", requestId: "r-flashcards-1" });
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
    expect(telegramSendFn.mock.calls[0]?.[0]?.message).toBe("Q1: A?\nA1: B.");

    const content = await readFile(flashcardsPath, "utf8");
    expect(content).toContain("# FLASHCARDS");
    expect(content).toContain("Flashcards topic");
    expect(content).toContain("idempotencyKey: flashcards-1");
    expect(content).toContain("> Q1: A?");
  });

  it("fails if flashcards cannot be persisted", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Q1: A?\nA1: B." } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const flashcardsAppendFn = vi.fn().mockRejectedValue(new Error("disk full"));

    const res = await forwardToOpenClaw(
      {
        ...makeRequest(),
        action: "flashcards",
        title: "Flashcards topic",
        idempotencyKey: "flashcards-2"
      },
      "r-flashcards-2",
      { fetchFn: fetchMock, flashcardsAppendFn }
    );

    expect(res).toEqual({ status: "failed", requestId: "r-flashcards-2", errorCode: "INTERNAL_ERROR" });
  });

  it("fails when required upstream env is missing", async () => {
    delete process.env.OPENCLAW_BASE_URL;
    delete process.env.OPENCLAW_TOKEN;

    const res = await forwardToOpenClaw(makeRequest(), "r1");
    expect(res).toEqual({ status: "failed", requestId: "r1", errorCode: "UPSTREAM_UNAVAILABLE" });
  });

  it("sends to chat completions when upstream is configured", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com/";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_SESSION_KEY = "agent:main:main";
    process.env.OPENCLAW_MODEL = "openclaw:main";
    process.env.OPENCLAW_AGENT_ID = "main";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await forwardToOpenClaw(makeRequest(), "r2", { fetchFn: fetchMock });
    expect(res).toEqual({ status: "sent", requestId: "r2" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openclaw.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers["x-openclaw-session-key"]).toBe("agent:main:main");
    expect(headers["x-openclaw-agent-id"]).toBe("main");

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openclaw:main");
    expect(body.stream).toBe(false);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0]?.role).toBe("user");
    expect(String(body.messages[0]?.content)).toContain("RightClaw action request:");
    expect(String(body.messages[0]?.content)).toContain('"requestId":"r2"');
  });

  it("returns queued on timeout", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_FORWARD_TIMEOUT_MS = "10";
    process.env.OPENCLAW_FORWARD_MAX_RETRIES = "0";

    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const res = await forwardToOpenClaw(makeRequest(), "r3", { fetchFn: fetchMock });
    expect(res.status).toBe("queued");
    expect(res.errorCode).toBe("UPSTREAM_TIMEOUT");
    expect(res.retryAfterMs).toBe(5000);
  });

  it("retries transient upstream failures and eventually succeeds", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_FORWARD_MAX_RETRIES = "2";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await forwardToOpenClaw(makeRequest(), "r4", { fetchFn: fetchMock });
    expect(res).toEqual({ status: "sent", requestId: "r4" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps non-retryable upstream 4xx to INTERNAL_ERROR", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_FORWARD_MAX_RETRIES = "2";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));

    const res = await forwardToOpenClaw(makeRequest(), "r5", { fetchFn: fetchMock });
    expect(res).toEqual({ status: "failed", requestId: "r5", errorCode: "INTERNAL_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends completion text to telegram when target is configured", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";
    process.env.OPENCLAW_TELEGRAM_CHANNEL = "telegram";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Summary for Telegram." } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const telegramSendFn = vi.fn().mockResolvedValue(undefined);

    const res = await forwardToOpenClaw(makeRequest(), "r6", { fetchFn: fetchMock, telegramSendFn });
    expect(res).toEqual({ status: "sent", requestId: "r6" });
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
    expect(telegramSendFn).toHaveBeenCalledWith({
      channel: "telegram",
      target: "telegram-target",
      message: "Summary for Telegram.",
      timeoutMs: 8000
    });
  });

  it("fails when telegram target is configured but send command fails", async () => {
    process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_TELEGRAM_TARGET = "telegram-target";
    process.env.OPENCLAW_FORWARD_MAX_RETRIES = "0";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Summary for Telegram." } }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const telegramSendFn = vi.fn().mockRejectedValue(new Error("telegram send failed"));

    const res = await forwardToOpenClaw(makeRequest(), "r7", { fetchFn: fetchMock, telegramSendFn });
    expect(res).toEqual({ status: "failed", requestId: "r7", errorCode: "UPSTREAM_UNAVAILABLE" });
    expect(telegramSendFn).toHaveBeenCalledTimes(1);
  });

});
