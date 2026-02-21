import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendBookmark } from "../src/lib/bookmarks.js";
import type { ActionRequest } from "../src/types/action.js";

function makeBookmark(url: string, idempotencyKey: string): ActionRequest {
  return {
    version: "1",
    action: "bookmark",
    source: "chrome",
    url,
    title: "Bookmark",
    timestamp: new Date().toISOString(),
    idempotencyKey
  };
}

describe("appendBookmark", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_BOOKMARKS_PATH;
  });

  it("deduplicates canonical URL variants", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;

    const first = await appendBookmark(
      makeBookmark("https://example.com/path/?utm_source=newsletter#section", "url-a"),
      "request-a"
    );
    const second = await appendBookmark(makeBookmark("https://example.com/path", "url-b"), "request-b");

    expect(first).toEqual({ deduped: false });
    expect(second).toEqual({ deduped: true, reason: "url" });

    const content = await readFile(bookmarksPath, "utf8");
    expect(content).toContain("idempotencyKey: url-a");
    expect(content).not.toContain("idempotencyKey: url-b");
  });

  it("deduplicates retries by idempotency key", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "openclaw-bookmarks-"));
    const bookmarksPath = path.join(tempDir, "BOOKMARKS.md");
    process.env.OPENCLAW_BOOKMARKS_PATH = bookmarksPath;

    const first = await appendBookmark(makeBookmark("https://example.com/retry", "retry-1"), "request-c");
    const second = await appendBookmark(makeBookmark("https://example.com/retry", "retry-1"), "request-d");

    expect(first).toEqual({ deduped: false });
    expect(second).toEqual({ deduped: true, reason: "idempotency" });

    const content = await readFile(bookmarksPath, "utf8");
    const matches = content.match(/idempotencyKey: retry-1/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
