import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ActionRequest } from "../types/action.js";

const DEFAULT_BOOKMARKS_PATH = path.resolve(process.cwd(), "../BOOKMARKS.md");
const MAX_TITLE_CHARS = 180;
const MAX_SELECTION_CHARS = 280;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 24;
const TRACKING_PARAM_NAMES = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "igshid"]);

export type BookmarkAppendResult =
  | { deduped: false }
  | { deduped: true; reason: "idempotency" | "url" };

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

function canonicalizeUrl(raw: string): string | null {
  const candidate = raw.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    const keptParams = [...url.searchParams.entries()]
      .filter(([key]) => {
        const normalized = key.toLowerCase();
        return !normalized.startsWith("utm_") && !TRACKING_PARAM_NAMES.has(normalized);
      })
      .sort(([aKey, aValue], [bKey, bValue]) => {
        if (aKey === bKey) return aValue.localeCompare(bValue);
        return aKey.localeCompare(bKey);
      });

    url.search = "";
    for (const [key, value] of keptParams) {
      url.searchParams.append(key, value);
    }

    return url.toString();
  } catch {
    return null;
  }
}

function extractUrlsFromBookmarks(content: string): string[] {
  const urls: string[] = [];
  const pattern = /\]\(<([^>\n]+)>\)|\]\((https?:\/\/[^\s)]+)\)/g;

  for (const match of content.matchAll(pattern)) {
    const url = match[1] ?? match[2];
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function hasDuplicateUrl(content: string, incomingUrl: string): boolean {
  const canonicalIncoming = canonicalizeUrl(incomingUrl);
  if (!canonicalIncoming) return false;

  for (const existingUrl of extractUrlsFromBookmarks(content)) {
    const canonicalExisting = canonicalizeUrl(existingUrl);
    if (canonicalExisting && canonicalExisting === canonicalIncoming) {
      return true;
    }
  }

  return false;
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

export async function appendBookmark(req: ActionRequest, requestId: string, now = new Date()): Promise<BookmarkAppendResult> {
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
    return { deduped: true, reason: "idempotency" };
  }

  if (req.url && hasDuplicateUrl(existing, req.url)) {
    return { deduped: true, reason: "url" };
  }

  const needsHeader = existing.trim().length === 0;
  const prefix = needsHeader ? "# BOOKMARKS\n\n" : existing.endsWith("\n") ? "\n" : "\n\n";
  const entry = bookmarkEntry(req, requestId, now);

  await appendFile(filePath, `${prefix}${entry}\n`, "utf8");
  return { deduped: false };
}
