import { ACTIONS, actionLabel } from "./actions.js";
import { getConfig } from "./config.js";
import { postAction } from "./api.js";
import { buildPayload } from "./payload.js";
import { createPendingPromptContext, purgeExpiredPromptContexts } from "./prompt-store.js";

const MENU_IDS = {
  summarize: "openclaw:summarize",
  explain: "openclaw:explain",
  flashcards: "openclaw:flashcards",
  bookmark: "openclaw:bookmark",
  prompt: "openclaw:prompt"
};
const LAST_RESULT_STORAGE_KEY = "lastActionResult";

function bridgeErrorMessage(errorCode) {
  if (errorCode === "MISSING_CLIENT_KEY") return "Set client key in extension options.";
  if (errorCode === "UNAUTHORIZED_CLIENT") return "Client key rejected by bridge.";
  if (errorCode === "STALE_TIMESTAMP") return "Request timestamp was stale.";
  if (errorCode === "INVALID_PAYLOAD") return "Payload rejected by bridge validation.";
  if (errorCode === "PAYLOAD_TOO_LARGE") return "Selected text exceeds bridge size limits.";
  if (errorCode === "UNSUPPORTED_ACTION") return "Action is not supported by bridge.";
  if (errorCode === "UPSTREAM_TIMEOUT") return "Bridge timed out talking to OpenClaw.";
  if (errorCode === "UPSTREAM_UNAVAILABLE") return "OpenClaw upstream is unavailable.";
  if (errorCode === "REQUEST_TIMEOUT") return "Request timed out before bridge responded.";
  if (errorCode === "NETWORK_ERROR") return "Network error talking to bridge.";
  return "Request failed.";
}

async function showNotification(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message
    });
  } catch {
    // Notifications can fail on some systems or profiles; badge remains as fallback.
  }
}

async function setBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "" }).catch(() => {});
    }, 6000);
  } catch {
    // Badge rendering is best-effort and must not affect action result delivery.
  }
}

function contextFromClick(info, tab) {
  const selection = typeof info.selectionText === "string" ? info.selectionText.trim() : undefined;
  const url = info.linkUrl || info.pageUrl || tab?.url;
  return {
    url,
    title: tab?.title,
    selection
  };
}

function makeLastResultEntry({ action, status, requestId, errorCode, message }) {
  return {
    updatedAt: new Date().toISOString(),
    action,
    status,
    requestId: requestId || "",
    errorCode: errorCode || "",
    message: message || ""
  };
}

async function persistLastResult(entry) {
  try {
    await chrome.storage.local.set({ [LAST_RESULT_STORAGE_KEY]: entry });
  } catch (error) {
    console.warn("Failed storing OpenClaw last result", error);
  }
}

async function sendBridgeAction(action, context, userPrompt) {
  await setBadge("...", "#0369a1");
  await showNotification(`${actionLabel(action)} sending`, "Sending request to bridge...");
  await persistLastResult(
    makeLastResultEntry({
      action,
      status: "sending",
      message: "Sending request to bridge..."
    })
  );
  const config = await getConfig();

  const payloadResult = buildPayload({
    action,
    url: context.url,
    title: context.title,
    selection: context.selection,
    userPrompt,
    responseMode: config.responseMode
  });

  if (!payloadResult.ok) {
    await setBadge("ERR", "#b91c1c");
    await showNotification(`${actionLabel(action)} failed`, payloadResult.reason);
    const result = { status: "failed", errorCode: "CLIENT_VALIDATION", message: payloadResult.reason };
    await persistLastResult(
      makeLastResultEntry({
        action,
        status: result.status,
        errorCode: result.errorCode,
        message: result.message
      })
    );
    return result;
  }

  const response = await postAction({
    bridgeUrl: config.bridgeUrl,
    clientKey: config.clientKey,
    requestTimeoutMs: config.requestTimeoutMs,
    payload: payloadResult.payload
  });

  if (response.status === "sent") {
    await setBadge("OK", "#15803d");
    const requestPart = response.requestId ? ` Request: ${response.requestId}.` : "";
    await showNotification(`${actionLabel(action)} sent`, `Request accepted by bridge.${requestPart}`);
    await persistLastResult(
      makeLastResultEntry({
        action,
        status: response.status,
        requestId: response.requestId,
        message: "Request accepted by bridge."
      })
    );
    return response;
  }

  if (response.status === "queued") {
    await setBadge("Q", "#a16207");
    const requestPart = response.requestId ? ` Request: ${response.requestId}.` : "";
    await showNotification(`${actionLabel(action)} queued`, `Bridge queued request.${requestPart}`);
    await persistLastResult(
      makeLastResultEntry({
        action,
        status: response.status,
        requestId: response.requestId,
        errorCode: response.errorCode,
        message: "Bridge queued request."
      })
    );
    return response;
  }

  await setBadge("ERR", "#b91c1c");
  const requestPart = response.requestId ? ` Request: ${response.requestId}.` : "";
  await showNotification(
    `${actionLabel(action)} failed`,
    `${bridgeErrorMessage(response.errorCode)}${requestPart}`
  );
  await persistLastResult(
    makeLastResultEntry({
      action,
      status: response.status,
      requestId: response.requestId,
      errorCode: response.errorCode,
      message: bridgeErrorMessage(response.errorCode)
    })
  );
  return response;
}

async function openPromptWindow(context) {
  const token = await createPendingPromptContext(context);
  await chrome.windows.create({
    url: chrome.runtime.getURL(`prompt/prompt.html?token=${encodeURIComponent(token)}`),
    type: "popup",
    width: 480,
    height: 560
  });
}

async function collectPromptFromPage(tabId, context) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (ctx) => {
      const overlayId = "__openclaw_prompt_overlay";
      const existing = document.getElementById(overlayId);
      if (existing) {
        existing.remove();
      }

      const escapeHtml = (value) =>
        String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");

      return await new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.id = overlayId;
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.zIndex = "2147483647";
        overlay.style.background = "rgba(2, 6, 23, 0.55)";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.padding = "24px";

        const card = document.createElement("div");
        card.style.width = "min(640px, 96vw)";
        card.style.maxHeight = "90vh";
        card.style.overflow = "auto";
        card.style.borderRadius = "12px";
        card.style.background = "#ffffff";
        card.style.border = "1px solid #cbd5e1";
        card.style.boxShadow = "0 24px 48px rgba(15, 23, 42, 0.22)";
        card.style.padding = "16px";
        card.style.color = "#0f172a";
        card.style.fontFamily = "Segoe UI, Helvetica Neue, Arial, sans-serif";

        const title = document.createElement("h2");
        title.textContent = "OpenClaw Custom Prompt";
        title.style.margin = "0 0 6px";
        title.style.fontSize = "20px";

        const subtitle = document.createElement("p");
        subtitle.textContent = "Send this page context with a custom instruction.";
        subtitle.style.margin = "0 0 12px";
        subtitle.style.color = "#475569";
        subtitle.style.fontSize = "14px";

        const meta = document.createElement("div");
        meta.style.fontSize = "12px";
        meta.style.padding = "8px 10px";
        meta.style.border = "1px solid #e2e8f0";
        meta.style.borderRadius = "8px";
        meta.style.background = "#f8fafc";
        meta.style.marginBottom = "10px";

        const selectionPreview =
          typeof ctx?.selection === "string" && ctx.selection.trim()
            ? ctx.selection.trim().slice(0, 700)
            : "(none)";
        meta.innerHTML = `
          <div><strong>Title:</strong> ${escapeHtml(ctx?.title || "-")}</div>
          <div><strong>URL:</strong> ${escapeHtml(ctx?.url || "-")}</div>
          <div><strong>Selection:</strong> ${escapeHtml(selectionPreview)}</div>
        `;

        const textarea = document.createElement("textarea");
        textarea.placeholder = "What should OpenClaw do?";
        textarea.style.width = "100%";
        textarea.style.boxSizing = "border-box";
        textarea.style.minHeight = "160px";
        textarea.style.border = "1px solid #cbd5e1";
        textarea.style.borderRadius = "10px";
        textarea.style.padding = "10px";
        textarea.style.font = "14px/1.4 Segoe UI, Helvetica Neue, Arial, sans-serif";
        textarea.style.resize = "vertical";

        const row = document.createElement("div");
        row.style.marginTop = "10px";
        row.style.display = "flex";
        row.style.gap = "8px";
        row.style.justifyContent = "flex-end";

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.style.border = "1px solid #cbd5e1";
        cancel.style.background = "#fff";
        cancel.style.color = "#0f172a";
        cancel.style.padding = "8px 12px";
        cancel.style.borderRadius = "8px";
        cancel.style.cursor = "pointer";

        const send = document.createElement("button");
        send.type = "button";
        send.textContent = "Send Prompt";
        send.style.border = "0";
        send.style.background = "#0f766e";
        send.style.color = "#fff";
        send.style.padding = "8px 12px";
        send.style.borderRadius = "8px";
        send.style.cursor = "pointer";

        row.append(cancel, send);
        card.append(title, subtitle, meta, textarea, row);
        overlay.append(card);
        document.documentElement.append(overlay);
        textarea.focus();

        const cleanup = () => {
          overlay.remove();
          document.removeEventListener("keydown", onKeydown, true);
        };

        const finish = (value) => {
          cleanup();
          resolve(value);
        };

        const onKeydown = (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish(null);
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            const text = textarea.value.trim();
            finish(text.length > 0 ? text : null);
          }
        };

        document.addEventListener("keydown", onKeydown, true);
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) {
            finish(null);
          }
        });
        cancel.addEventListener("click", () => finish(null));
        send.addEventListener("click", () => {
          const text = textarea.value.trim();
          finish(text.length > 0 ? text : null);
        });
      });
    },
    args: [context]
  });

  return injected?.[0]?.result || null;
}

async function handleMenuClick(info, tab) {
  const context = contextFromClick(info, tab);

  if (info.menuItemId === MENU_IDS.summarize) {
    await sendBridgeAction(ACTIONS.SUMMARIZE, context);
    return;
  }

  if (info.menuItemId === MENU_IDS.explain) {
    await sendBridgeAction(ACTIONS.EXPLAIN, context);
    return;
  }

  if (info.menuItemId === MENU_IDS.flashcards) {
    await sendBridgeAction(ACTIONS.FLASHCARDS, context);
    return;
  }

  if (info.menuItemId === MENU_IDS.bookmark) {
    await sendBridgeAction(ACTIONS.BOOKMARK, context);
    return;
  }

  if (info.menuItemId === MENU_IDS.prompt) {
    if (typeof tab?.id === "number") {
      try {
        const promptText = await collectPromptFromPage(tab.id, context);
        if (promptText) {
          await sendBridgeAction(ACTIONS.PROMPT, context, promptText);
        }
        return;
      } catch (error) {
        console.warn("Inline prompt unavailable, falling back to popup prompt window.", error);
      }
    }

    await openPromptWindow(context);
  }
}

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_IDS.summarize,
    title: "Summarize with OpenClaw",
    contexts: ["page", "selection", "link"]
  });

  chrome.contextMenus.create({
    id: MENU_IDS.explain,
    title: "Explain with OpenClaw",
    contexts: ["page", "selection", "link"]
  });

  chrome.contextMenus.create({
    id: MENU_IDS.flashcards,
    title: "Create Flashcards with OpenClaw",
    contexts: ["page", "selection", "link"]
  });

  chrome.contextMenus.create({
    id: MENU_IDS.bookmark,
    title: "Bookmark in OpenClaw",
    contexts: ["page", "link"]
  });

  chrome.contextMenus.create({
    id: MENU_IDS.prompt,
    title: "Custom Prompt with OpenClaw",
    contexts: ["page", "selection", "link"]
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureContextMenus();
  await purgeExpiredPromptContexts();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureContextMenus();
  await purgeExpiredPromptContexts();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab).catch((error) => {
    console.error("OpenClaw context action failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "openclaw:sendPrompt") return false;

  sendBridgeAction(ACTIONS.PROMPT, message.context || {}, message.userPrompt)
    .then((result) => sendResponse({ ok: result?.status === "sent" || result?.status === "queued", result }))
    .catch((error) => {
      console.error("OpenClaw prompt action failed", error);
      sendResponse({ ok: false });
    });

  return true;
});
