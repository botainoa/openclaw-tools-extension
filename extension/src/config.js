const STORAGE_KEYS = {
  bridgeUrl: "bridgeUrl",
  clientKey: "clientKey",
  responseMode: "responseMode",
  requestTimeoutMs: "requestTimeoutMs"
};

const DEFAULTS = {
  bridgeUrl: "http://127.0.0.1:8787",
  clientKey: "",
  responseMode: "telegram",
  requestTimeoutMs: 8000
};

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

export function normalizeBridgeUrl(value) {
  const trimmed = (value || "").trim();
  return stripTrailingSlash(trimmed || DEFAULTS.bridgeUrl);
}

export async function getConfig() {
  const stored = await chrome.storage.local.get(Object.values(STORAGE_KEYS));

  return {
    bridgeUrl: normalizeBridgeUrl(stored[STORAGE_KEYS.bridgeUrl]),
    clientKey: (stored[STORAGE_KEYS.clientKey] || "").trim(),
    responseMode: stored[STORAGE_KEYS.responseMode] || DEFAULTS.responseMode,
    requestTimeoutMs: Number(stored[STORAGE_KEYS.requestTimeoutMs] || DEFAULTS.requestTimeoutMs)
  };
}

export async function saveConfig(partial) {
  const update = {};

  if (Object.hasOwn(partial, "bridgeUrl")) {
    update[STORAGE_KEYS.bridgeUrl] = normalizeBridgeUrl(partial.bridgeUrl);
  }

  if (Object.hasOwn(partial, "clientKey")) {
    update[STORAGE_KEYS.clientKey] = (partial.clientKey || "").trim();
  }

  if (Object.hasOwn(partial, "responseMode")) {
    update[STORAGE_KEYS.responseMode] = partial.responseMode || DEFAULTS.responseMode;
  }

  if (Object.hasOwn(partial, "requestTimeoutMs")) {
    const timeout = Number(partial.requestTimeoutMs);
    update[STORAGE_KEYS.requestTimeoutMs] = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULTS.requestTimeoutMs;
  }

  await chrome.storage.local.set(update);
  return getConfig();
}

export function defaultConfig() {
  return { ...DEFAULTS };
}
