import { deletePendingPromptContext, readPendingPromptContext } from "../src/prompt-store.js";

const contextUrlEl = document.getElementById("contextUrl");
const contextTitleEl = document.getElementById("contextTitle");
const contextSelectionEl = document.getElementById("contextSelection");
const promptTextEl = document.getElementById("promptText");
const sendBtnEl = document.getElementById("sendBtn");
const statusEl = document.getElementById("status");

let token = null;
let context = null;

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setContextUI(value) {
  contextUrlEl.textContent = value?.url || "-";
  contextTitleEl.textContent = value?.title || "-";
  contextSelectionEl.textContent = value?.selection || "(none)";
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  token = params.get("token");

  if (!token) {
    setStatus("Missing prompt token.", "error");
    sendBtnEl.disabled = true;
    return;
  }

  context = await readPendingPromptContext(token);
  if (!context) {
    setStatus("Prompt context was not found or has expired.", "error");
    sendBtnEl.disabled = true;
    return;
  }

  setContextUI(context);
}

async function onSend() {
  const userPrompt = promptTextEl.value.trim();
  if (!userPrompt) {
    setStatus("Prompt text is required.", "error");
    return;
  }

  sendBtnEl.disabled = true;
  setStatus("Sending prompt...");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "openclaw:sendPrompt",
      context,
      userPrompt
    });

    if (result?.ok === true) {
      setStatus("Prompt sent. Check Telegram for the response.", "ok");
      if (token) {
        await deletePendingPromptContext(token);
      }
      setTimeout(() => window.close(), 900);
      return;
    }

    const sendStatus = result?.result?.status;
    if (sendStatus === "sent") {
      setStatus("Prompt sent. Check Telegram for the response.", "ok");
      if (token) {
        await deletePendingPromptContext(token);
      }
      setTimeout(() => window.close(), 900);
      return;
    }

    if (sendStatus === "queued") {
      setStatus("Prompt queued by bridge. Telegram reply may be delayed.", "ok");
      if (token) {
        await deletePendingPromptContext(token);
      }
      setTimeout(() => window.close(), 900);
      return;
    }

    setStatus("Prompt failed. Check extension logs and bridge status.", "error");
  } catch (error) {
    console.error("Failed sending OpenClaw prompt", error);
    setStatus("Prompt failed. Check extension logs.", "error");
  } finally {
    sendBtnEl.disabled = false;
  }
}

sendBtnEl.addEventListener("click", () => {
  onSend().catch((error) => {
    console.error("OpenClaw prompt send error", error);
    setStatus("Prompt failed unexpectedly.", "error");
    sendBtnEl.disabled = false;
  });
});

init().catch((error) => {
  console.error("OpenClaw prompt init failed", error);
  setStatus("Failed to initialize prompt window.", "error");
});
