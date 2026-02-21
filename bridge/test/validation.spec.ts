import { describe, expect, it } from "vitest";
import { validatePayload } from "../src/lib/validation.js";

function basePayload() {
  return {
    version: "1",
    action: "summarize",
    source: "chrome" as const,
    timestamp: new Date().toISOString(),
    url: "https://example.com"
  };
}

describe("validatePayload", () => {
  it("accepts valid payload", () => {
    expect(validatePayload(basePayload()).ok).toBe(true);
  });

  it("rejects unsupported action", () => {
    const result = validatePayload({ ...basePayload(), action: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported_action");
    }
  });

  it("rejects stale timestamp", () => {
    const result = validatePayload({ ...basePayload(), timestamp: "2000-01-01T00:00:00.000Z" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("stale_timestamp");
    }
  });

  it("normalizes summarise alias to summarize", () => {
    const result = validatePayload({ ...basePayload(), action: "Summarise" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.action).toBe("summarize");
    }
  });

  it("rejects invalid response mode", () => {
    const result = validatePayload({ ...basePayload(), responseMode: "email" as unknown as "telegram" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_response_mode");
    }
  });
});
