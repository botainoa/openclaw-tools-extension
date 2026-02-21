import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ActionRequest } from "../types/action.js";

const DEFAULT_BOOKMARKS_PATH = path.resolve(process.cwd(), "../BOOKMARKS.md");
const MAX_TITLE_CHARS = 180;
const MAX_SELECTION_CHARS = 280;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 24;

function singleLine(input: string | undefined, maxChars: number): string | undefined {
  if (!input) return undefined;
  const value = input.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

function escapeMarkdownText(input: string): string {
  return input
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("`", "\\`");
}

function sanitizeTag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, MAX_TAG_CHARS);

  return cleaned.length > 0 ? cleaned : null;
}

function buildBookmarkLine(req: ActionRequest, now: Date): string {
  const timestamp = `${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const safeTitle = escapeMarkdownText(singleLine(req.title, MAX_TITLE_CHARS) ?? "Untitled");

  if (req.url) {
    const safeUrl = req.url.trim();
    return `- ${timestamp} — [${safeTitle}](<${safeUrl}>)`;
  }

  return `- ${timestamp} — ${safeTitle}`;
}

function buildMetadataLines(req: ActionRequest, requestId: string): string[] {
  const lines: string[] = [];

  lines.push(`  - source: ${req.source}`);

  const tags = (req.tags ?? [])
    .map((tag) => sanitizeTag(String(tag)))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, MAX_TAGS);

  if (tags.length > 0) {
    lines.push(`  - tags: ${tags.map((tag) => `#${tag}`).join(" ")}`);
  }

  const snippet = singleLine(req.selection, MAX_SELECTION_CHARS);
  if (snippet) {
    lines.push(`  - note: ${escapeMarkdownText(snippet)}`);
  }

  if (req.idempotencyKey) {
    lines.push(`  - idempotencyKey: ${req.idempotencyKey}`);
  }

  lines.push(`  - requestId: ${requestId}`);

  return lines;
}

function bookmarkEntry(req: ActionRequest, requestId: string, now: Date): string {
  return [buildBookmarkLine(req, now), ...buildMetadataLines(req, requestId)].join("\n");
}

export async function appendBookmark(req: ActionRequest, requestId: string, now = new Date()): Promise<{ deduped: boolean }> {
  const filePath = process.env.OPENCLAW_BOOKMARKS_PATH || DEFAULT_BOOKMARKS_PATH;
  await mkdir(path.dirname(filePath), { recursive: true });

  let existing = "";
  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
    existing = "";
  }

  if (req.idempotencyKey && existing.includes(`idempotencyKey: ${req.idempotencyKey}`)) {
    return { deduped: true };
  }

  const needsHeader = existing.trim().length === 0;
  const prefix = needsHeader ? "# BOOKMARKS\n\n" : existing.endsWith("\n") ? "\n" : "\n\n";
  const entry = bookmarkEntry(req, requestId, now);

  await appendFile(filePath, `${prefix}${entry}\n`, "utf8");
  return { deduped: false };
}
