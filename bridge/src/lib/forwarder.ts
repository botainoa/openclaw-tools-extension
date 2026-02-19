import type { ActionRequest, BridgeResponse } from "../types/action.js";

export async function forwardToOpenClaw(_req: ActionRequest, requestId: string): Promise<BridgeResponse> {
  return { status: "sent", requestId };
}
