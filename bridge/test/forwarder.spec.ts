import { describe, expect, it, vi } from "vitest";
import { forwardToOpenClaw } from "../src/lib/forwarder.js";
import type { ActionRequest } from "../src/types/action.js";

const req: ActionRequest = {
  version: "1",
  action: "summarize",
  source: "chrome",
  url: "https://example.com",
  timestamp: new Date().toISOString()
};

describe("forwardToOpenClaw", () => {
  it("fails when upstream env is missing", async () => {
    delete process.env.OPENCLAW_BASE_URL;
    delete process.env.OPENCLAW_TOKEN;

    const res = await forwardToOpenClaw(req, "r1");
    expect(res).toEqual({ status: "failed", requestId: "r1", errorCode: "UPSTREAM_UNAVAILABLE" });
  });

  it("sends to OpenClaw when upstream is configured", async () => {
    process.env.OPENCLAW_BASE_URL = "http://127.0.0.1:3400/";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_SESSION_KEY = "agent:main:main";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await forwardToOpenClaw(req, "r2", { fetchFn: fetchMock });
    expect(res).toEqual({ status: "sent", requestId: "r2" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3400/api/sessions/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");

    const body = JSON.parse(String(init.body));
    expect(body.sessionKey).toBe("agent:main:main");
    expect(typeof body.message).toBe("string");
    expect(body.message).toContain("OpenClaw Tools action request:");
    expect(body.message).toContain('"requestId":"r2"');
  });

  it("returns queued on timeout", async () => {
    process.env.OPENCLAW_BASE_URL = "http://127.0.0.1:3400";
    process.env.OPENCLAW_TOKEN = "token";
    process.env.OPENCLAW_FORWARD_TIMEOUT_MS = "10";

    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const res = await forwardToOpenClaw(req, "r3", { fetchFn: fetchMock });
    expect(res.status).toBe("queued");
    expect(res.errorCode).toBe("UPSTREAM_TIMEOUT");
    expect(res.retryAfterMs).toBe(5000);
  });
});
