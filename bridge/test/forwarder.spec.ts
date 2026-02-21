import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToOpenClaw } from "../src/lib/forwarder.js";
import type { ActionRequest } from "../src/types/action.js";

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
    expect(String(body.messages[0]?.content)).toContain("OpenClaw Tools action request:");
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
