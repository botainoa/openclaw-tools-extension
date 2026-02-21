import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { isAuthorized } from "../lib/auth.js";
import { forwardToOpenClaw } from "../lib/forwarder.js";
import { validatePayload } from "../lib/validation.js";
import type { ActionRequest, BridgeResponse } from "../types/action.js";

type ForwardActionFn = (req: ActionRequest, requestId: string) => Promise<BridgeResponse>;

const actionBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string" },
    action: { type: "string" },
    source: { type: "string" },
    url: { type: "string" },
    title: { type: "string" },
    selection: { type: "string" },
    userPrompt: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    responseMode: { type: "string" },
    idempotencyKey: { type: "string" },
    timestamp: { type: "string" }
  }
} as const;

const actionHeaderSchema = {
  type: "object",
  properties: {
    "x-openclaw-client-key": { type: "string" }
  }
} as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["sent", "queued", "failed"] },
    requestId: { type: "string" },
    errorCode: { type: "string" },
    retryAfterMs: { type: "number" }
  },
  required: ["status", "requestId"]
} as const;

export async function registerActionRoute(app: FastifyInstance, deps: { forwardFn?: ForwardActionFn } = {}) {
  const forwardFn = deps.forwardFn ?? forwardToOpenClaw;

  app.post<{ Body: ActionRequest }>(
    "/v1/action",
    {
      schema: {
        headers: actionHeaderSchema,
        body: actionBodySchema,
        response: {
          200: responseSchema,
          202: responseSchema,
          400: responseSchema,
          401: responseSchema,
          413: responseSchema,
          415: responseSchema,
          500: responseSchema,
          502: responseSchema
        }
      }
    },
    async (request, reply) => {
      const requestId = randomUUID();
      const startedAt = performance.now();

      if (!isAuthorized(request)) {
        return reply.code(401).send({ status: "failed", requestId, errorCode: "UNAUTHORIZED_CLIENT" });
      }

      const check = validatePayload(request.body);
      if (!check.ok) {
        if (check.reason === "unsupported_action") {
          return reply.code(400).send({ status: "failed", requestId, errorCode: "UNSUPPORTED_ACTION" });
        }
        if (check.reason === "stale_timestamp") {
          return reply.code(400).send({ status: "failed", requestId, errorCode: "STALE_TIMESTAMP" });
        }
        if (check.reason === "payload_too_large") {
          return reply.code(413).send({ status: "failed", requestId, errorCode: "PAYLOAD_TOO_LARGE" });
        }
        return reply.code(400).send({ status: "failed", requestId, errorCode: "INVALID_PAYLOAD" });
      }

      const response = await forwardFn(check.payload, requestId);
      const statusCode = response.status === "sent" ? 200 : response.status === "queued" ? 202 : 502;

      request.log.info(
        {
          requestId,
          action: check.payload.action,
          source: check.payload.source,
          status: response.status,
          ackLatencyMs: Math.round(performance.now() - startedAt)
        },
        "action request handled"
      );

      return reply.code(statusCode).send(response);
    }
  );
}
