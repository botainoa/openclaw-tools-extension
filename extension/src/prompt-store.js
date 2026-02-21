const PROMPT_PREFIX = "pendingPrompt:";
const MAX_PROMPT_CONTEXT_AGE_MS = 30 * 60 * 1000;

function promptKey(token) {
  return `${PROMPT_PREFIX}${token}`;
}

export async function createPendingPromptContext(context) {
  const token = crypto.randomUUID();
  await chrome.storage.local.set({
    [promptKey(token)]: {
      createdAt: Date.now(),
      context
    }
  });
  return token;
}

export async function readPendingPromptContext(token) {
  const key = promptKey(token);
  const result = await chrome.storage.local.get([key]);
  const entry = result[key];
  if (!entry) return null;

  const ageMs = Date.now() - Number(entry.createdAt || 0);
  if (ageMs > MAX_PROMPT_CONTEXT_AGE_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry.context || null;
}

export async function deletePendingPromptContext(token) {
  await chrome.storage.local.remove(promptKey(token));
}

export async function purgeExpiredPromptContexts() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const staleKeys = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(PROMPT_PREFIX)) continue;
    const createdAt = Number(value?.createdAt || 0);
    if (now - createdAt > MAX_PROMPT_CONTEXT_AGE_MS) {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length > 0) {
    await chrome.storage.local.remove(staleKeys);
  }
}
