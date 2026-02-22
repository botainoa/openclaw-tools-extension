import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ActionRequest } from "../types/action.js";

const DEFAULT_FLASHCARDS_PATH = path.resolve(process.cwd(), "../FLASHCARDS.md");
const MAX_TITLE_CHARS = 180;
const MAX_CARDS_TEXT_CHARS = 12000;

export type FlashcardsAppendResult =
  | { deduped: false }
  | { deduped: true; reason: "idempotency" };

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

function normalizeCardsText(text: string): string {
  const trimmed = text.trim();
  const clipped = trimmed.length > MAX_CARDS_TEXT_CHARS ? `${trimmed.slice(0, MAX_CARDS_TEXT_CHARS)}…` : trimmed;
  return clipped;
}

function asQuotedBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim().length === 0 ? ">" : `> ${line}`))
    .join("\n");
}

function flashcardsEntry(req: ActionRequest, requestId: string, cardsText: string, now: Date): string {
  const timestamp = `${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const safeTitle = escapeMarkdownText(singleLine(req.title, MAX_TITLE_CHARS) ?? "Untitled");

  const lines: string[] = [];
  lines.push(`## ${timestamp} — ${safeTitle}`);
  lines.push(`- source: ${req.source}`);
  if (req.url?.trim()) {
    lines.push(`- url: <${req.url.trim()}>`);
  }
  if (req.idempotencyKey) {
    lines.push(`- idempotencyKey: ${req.idempotencyKey}`);
  }
  lines.push(`- requestId: ${requestId}`);
  lines.push("");
  lines.push("### Cards");
  lines.push(asQuotedBlock(normalizeCardsText(cardsText)));

  return lines.join("\n");
}

export async function appendFlashcards(
  req: ActionRequest,
  requestId: string,
  cardsText: string,
  now = new Date()
): Promise<FlashcardsAppendResult> {
  const filePath = process.env.OPENCLAW_FLASHCARDS_PATH || DEFAULT_FLASHCARDS_PATH;
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

  const needsHeader = existing.trim().length === 0;
  const prefix = needsHeader ? "# FLASHCARDS\n\n" : existing.endsWith("\n") ? "\n" : "\n\n";
  const entry = flashcardsEntry(req, requestId, cardsText, now);

  await appendFile(filePath, `${prefix}${entry}\n`, "utf8");
  return { deduped: false };
}
