import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendFlashcards } from "../src/lib/flashcards.js";
import type { ActionRequest } from "../src/types/action.js";

function makeRequest(idempotencyKey: string): ActionRequest {
  return {
    version: "1",
    action: "flashcards",
    source: "chrome",
    url: "https://example.com/learn",
    title: "Learning page",
    timestamp: new Date().toISOString(),
    idempotencyKey
  };
}

describe("appendFlashcards", () => {
  afterEach(() => {
    delete process.env.OPENCLAW_FLASHCARDS_PATH;
  });

  it("writes flashcards entry with metadata", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "rightclaw-flashcards-"));
    const flashcardsPath = path.join(tempDir, "FLASHCARDS.md");
    process.env.OPENCLAW_FLASHCARDS_PATH = flashcardsPath;

    const result = await appendFlashcards(
      makeRequest("flashcards-1"),
      "request-1",
      "Q1: What is latency?\nA1: Delay between request and response."
    );

    expect(result).toEqual({ deduped: false });

    const content = await readFile(flashcardsPath, "utf8");
    expect(content).toContain("# FLASHCARDS");
    expect(content).toContain("## ");
    expect(content).toContain("Learning page");
    expect(content).toContain("- source: chrome");
    expect(content).toContain("- url: <https://example.com/learn>");
    expect(content).toContain("- idempotencyKey: flashcards-1");
    expect(content).toContain("- requestId: request-1");
    expect(content).toContain("### Cards");
    expect(content).toContain("> Q1: What is latency?");
    expect(content).toContain("> A1: Delay between request and response.");
  });

  it("deduplicates retries by idempotency key", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "rightclaw-flashcards-"));
    const flashcardsPath = path.join(tempDir, "FLASHCARDS.md");
    process.env.OPENCLAW_FLASHCARDS_PATH = flashcardsPath;

    const first = await appendFlashcards(makeRequest("flashcards-retry-1"), "request-a", "Q1\nA1");
    const second = await appendFlashcards(makeRequest("flashcards-retry-1"), "request-b", "Q1\nA1");

    expect(first).toEqual({ deduped: false });
    expect(second).toEqual({ deduped: true, reason: "idempotency" });

    const content = await readFile(flashcardsPath, "utf8");
    const matches = content.match(/idempotencyKey: flashcards-retry-1/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
