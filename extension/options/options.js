import { defaultConfig, getConfig, normalizeBridgeUrl, saveConfig } from "../src/config.js";
import { getHealth } from "../src/api.js";

const LAST_RESULT_STORAGE_KEY = "lastActionResult";

const bridgeUrlEl = document.getElementById("bridgeUrl");
const clientKeyEl = document.getElementById("clientKey");
const responseModeEl = document.getElementById("responseMode");
const requestTimeoutMsEl = document.getElementById("requestTimeoutMs");
const saveBtnEl = document.getElementById("saveBtn");
const healthBtnEl = document.getElementById("healthBtn");
const clearResultBtnEl = document.getElementById("clearResultBtn");
const statusEl = document.getElementById("status");
const lastResultStatusEl = document.getElementById("lastResultStatus");
const lastResultActionEl = document.getElementById("lastResultAction");
const lastResultUpdatedEl = document.getElementById("lastResultUpdated");
const lastResultRequestIdEl = document.getElementById("lastResultRequestId");
const lastResultErrorEl = document.getElementById("lastResultError");
const lastResultMessageEl = document.getElementById("lastResultMessage");

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function valueOrDash(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function formatDateTime(isoString) {
  const ts = Date.parse(isoString || "");
  if (Number.isNaN(ts)) return "-";
  return new Date(ts).toLocaleString();
}

function renderLastResult(entry) {
  if (!entry || typeof entry !== "object") {
    lastResultStatusEl.textContent = "-";
    lastResultActionEl.textContent = "-";
    lastResultUpdatedEl.textContent = "-";
    lastResultRequestIdEl.textContent = "-";
    lastResultErrorEl.textContent = "-";
    lastResultMessageEl.textContent = "-";
    return;
  }

  lastResultStatusEl.textContent = valueOrDash(entry.status);
  lastResultActionEl.textContent = valueOrDash(entry.action);
  lastResultUpdatedEl.textContent = formatDateTime(entry.updatedAt);
  lastResultRequestIdEl.textContent = valueOrDash(entry.requestId);
  lastResultErrorEl.textContent = valueOrDash(entry.errorCode);
  lastResultMessageEl.textContent = valueOrDash(entry.message);
}

async function hydrateForm() {
  const config = await getConfig();
  bridgeUrlEl.value = config.bridgeUrl;
  clientKeyEl.value = config.clientKey;
  responseModeEl.value = config.responseMode;
  requestTimeoutMsEl.value = String(config.requestTimeoutMs);
}

async function hydrateLastResult() {
  const stored = await chrome.storage.local.get([LAST_RESULT_STORAGE_KEY]);
  renderLastResult(stored[LAST_RESULT_STORAGE_KEY] || null);
}

async function onSave() {
  const fallback = defaultConfig();
  const bridgeUrl = normalizeBridgeUrl(bridgeUrlEl.value || fallback.bridgeUrl);
  const clientKey = clientKeyEl.value || "";
  const responseMode = responseModeEl.value || fallback.responseMode;
  const requestTimeoutMs = Number(requestTimeoutMsEl.value || fallback.requestTimeoutMs);

  await saveConfig({
    bridgeUrl,
    clientKey,
    responseMode,
    requestTimeoutMs
  });

  setStatus("Settings saved.", "ok");
}

async function onHealthCheck() {
  setStatus("Checking bridge health...");
  const bridgeUrl = normalizeBridgeUrl(bridgeUrlEl.value || defaultConfig().bridgeUrl);
  const result = await getHealth(bridgeUrl, 5000);

  if (result.ok) {
    setStatus(`Bridge healthy (${result.httpStatus}).`, "ok");
    return;
  }

  if (result.error) {
    setStatus(`Health check failed: ${result.error}.`, "error");
    return;
  }

  setStatus(`Bridge unhealthy (${result.httpStatus}).`, "error");
}

async function onClearLastResult() {
  await chrome.storage.local.remove([LAST_RESULT_STORAGE_KEY]);
  renderLastResult(null);
  setStatus("Last bridge result cleared.");
}

saveBtnEl.addEventListener("click", () => {
  onSave().catch((error) => {
    console.error("Failed saving OpenClaw options", error);
    setStatus("Failed to save settings.", "error");
  });
});

healthBtnEl.addEventListener("click", () => {
  onHealthCheck().catch((error) => {
    console.error("OpenClaw health check failed", error);
    setStatus("Health check failed.", "error");
  });
});

clearResultBtnEl.addEventListener("click", () => {
  onClearLastResult().catch((error) => {
    console.error("Failed clearing last bridge result", error);
    setStatus("Failed to clear last bridge result.", "error");
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!Object.hasOwn(changes, LAST_RESULT_STORAGE_KEY)) return;
  renderLastResult(changes[LAST_RESULT_STORAGE_KEY].newValue || null);
});

Promise.all([hydrateForm(), hydrateLastResult()]).catch((error) => {
  console.error("Failed loading OpenClaw options", error);
  setStatus("Failed loading saved settings.", "error");
});
