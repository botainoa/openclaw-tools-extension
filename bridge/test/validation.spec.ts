import { describe, expect, it } from "vitest";
import { validatePayload } from "../src/lib/validation.js";

const base = {
  version: "1",
  action: "summarize",
  source: "chrome" as const,
  timestamp: new Date().toISOString(),
  url: "https://example.com"
};

describe("validatePayload", () => {
  it("accepts valid payload", () => {
    expect(validatePayload(base).ok).toBe(true);
  });

  it("rejects unsupported action", () => {
    expect(validatePayload({ ...base, action: "nope" }).reason).toBe("unsupported_action");
  });

  it("rejects stale timestamp", () => {
    expect(validatePayload({ ...base, timestamp: "2000-01-01T00:00:00.000Z" }).reason).toBe("stale_timestamp");
  });
});
