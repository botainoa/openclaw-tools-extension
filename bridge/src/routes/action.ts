import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { isAuthorized } from "../lib/auth.js";
import { validatePayload } from "../lib/validation.js";
import { forwardToOpenClaw } from "../lib/forwarder.js";
import type { ActionRequest } from "../types/action.js";

export async function registerActionRoute(app: FastifyInstance) {
  app.post<{ Body: ActionRequest }>("/v1/action", async (request, reply) => {
    const requestId = randomUUID();

    if (!isAuthorized(request)) {
      return reply.code(401).send({ status: "failed", requestId, errorCode: "UNAUTHORIZED_CLIENT" });
    }

    const check = validatePayload(request.body);
    if (!check.ok) {
      if (check.reason === "unsupported_action") return reply.code(400).send({ status: "failed", requestId, errorCode: "UNSUPPORTED_ACTION" });
      if (check.reason === "stale_timestamp") return reply.code(400).send({ status: "failed", requestId, errorCode: "STALE_TIMESTAMP" });
      if (check.reason === "payload_too_large") return reply.code(413).send({ status: "failed", requestId, errorCode: "PAYLOAD_TOO_LARGE" });
      return reply.code(400).send({ status: "failed", requestId, errorCode: "INVALID_PAYLOAD" });
    }

    const response = await forwardToOpenClaw(request.body, requestId);
    return reply.code(200).send(response);
  });
}
