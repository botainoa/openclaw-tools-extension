function normalizeErrorCode(code) {
  if (!code) return "INTERNAL_ERROR";
  return String(code);
}

function parseActionResponse(json, httpStatus) {
  const status = json?.status || "failed";
  const requestId = json?.requestId;
  const errorCode = json?.errorCode;
  const retryAfterMs = json?.retryAfterMs;

  return {
    status,
    requestId,
    errorCode,
    retryAfterMs,
    httpStatus
  };
}

export async function postAction({ bridgeUrl, clientKey, requestTimeoutMs, payload }) {
  if (!clientKey) {
    return {
      status: "failed",
      errorCode: "MISSING_CLIENT_KEY",
      message: "Client key is missing. Set it in extension options."
    };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${bridgeUrl}/v1/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenClaw-Client-Key": clientKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (json && typeof json === "object") {
      return parseActionResponse(json, response.status);
    }

    return {
      status: "failed",
      errorCode: normalizeErrorCode(response.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INVALID_PAYLOAD"),
      httpStatus: response.status
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "failed",
        errorCode: "REQUEST_TIMEOUT"
      };
    }

    return {
      status: "failed",
      errorCode: "NETWORK_ERROR"
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function getHealth(bridgeUrl, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${bridgeUrl}/health`, {
      method: "GET",
      signal: controller.signal
    });

    const body = await response.text();
    return {
      ok: response.ok,
      httpStatus: response.status,
      body
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "REQUEST_TIMEOUT" };
    }
    return { ok: false, error: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
