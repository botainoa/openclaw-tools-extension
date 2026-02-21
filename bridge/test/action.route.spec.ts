import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { ActionRequest, BridgeResponse } from "../src/types/action.js";

function basePayload(): ActionRequest {
  return {
    version: "1",
    action: "summarize",
    source: "chrome",
    url: "https://example.com",
    timestamp: new Date().toISOString()
  };
}

afterEach(() => {
  delete process.env.OPENCLAW_CLIENT_KEY;
  vi.restoreAllMocks();
});

describe("POST /v1/action", () => {
  it("returns UNAUTHORIZED_CLIENT without shared secret header", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      payload: basePayload()
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ status: "failed", errorCode: "UNAUTHORIZED_CLIENT" });
    await app.close();
  });

  it("normalizes summarise alias before forwarding", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";

    const forwardFn = vi.fn(async (req: ActionRequest, requestId: string): Promise<BridgeResponse> => {
      return { status: "sent", requestId };
    });
    const app = await buildApp({ forwardFn });

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret"
      },
      payload: {
        ...basePayload(),
        action: "summarise"
      }
    });

    expect(res.statusCode).toBe(200);
    expect(forwardFn).toHaveBeenCalledTimes(1);
    expect(forwardFn.mock.calls[0]?.[0]?.action).toBe("summarize");
    await app.close();
  });

  it("returns PAYLOAD_TOO_LARGE when selection exceeds max limit", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const forwardFn = vi.fn();
    const app = await buildApp({ forwardFn });

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret"
      },
      payload: {
        ...basePayload(),
        selection: "x".repeat(20001)
      }
    });

    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ status: "failed", errorCode: "PAYLOAD_TOO_LARGE" });
    expect(forwardFn).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns UNSUPPORTED_ACTION for unknown actions", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const forwardFn = vi.fn();
    const app = await buildApp({ forwardFn });

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret"
      },
      payload: {
        ...basePayload(),
        action: "translate"
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: "failed", errorCode: "UNSUPPORTED_ACTION" });
    expect(forwardFn).not.toHaveBeenCalled();
    await app.close();
  });

  it("maps forwarder queued response to HTTP 202", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const app = await buildApp({
      forwardFn: async (_req: ActionRequest, requestId: string): Promise<BridgeResponse> => ({
        status: "queued",
        requestId,
        errorCode: "UPSTREAM_TIMEOUT",
        retryAfterMs: 5000
      })
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret"
      },
      payload: basePayload()
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: "queued", errorCode: "UPSTREAM_TIMEOUT" });
    await app.close();
  });

  it("maps unknown body fields to INVALID_PAYLOAD via schema", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret"
      },
      payload: {
        ...basePayload(),
        rogueField: "not-allowed"
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: "failed", errorCode: "INVALID_PAYLOAD" });
    await app.close();
  });

  it("returns INVALID_PAYLOAD for unsupported content type", async () => {
    process.env.OPENCLAW_CLIENT_KEY = "dev-secret";
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/v1/action",
      headers: {
        "x-openclaw-client-key": "dev-secret",
        "content-type": "application/x-www-form-urlencoded"
      },
      payload: "version=1&action=summarize"
    });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ status: "failed", errorCode: "INVALID_PAYLOAD" });
    await app.close();
  });
});
