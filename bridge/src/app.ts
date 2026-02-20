import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { registerHealthRoute } from "./routes/health.js";
import { registerActionRoute } from "./routes/action.js";
import type { ActionRequest, BridgeResponse } from "./types/action.js";

type ForwardActionFn = (req: ActionRequest, requestId: string) => Promise<BridgeResponse>;

export async function buildApp(deps: { forwardFn?: ForwardActionFn } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024,
    ajv: {
      customOptions: {
        // Keep unknown fields so `additionalProperties: false` can reject them.
        removeAdditional: false
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const hasValidationError = typeof error === "object" && error !== null && "validation" in error;
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;

    if (hasValidationError || statusCode === 400) {
      return reply.code(400).send({
        status: "failed",
        requestId: randomUUID(),
        errorCode: "INVALID_PAYLOAD"
      });
    }

    if (statusCode === 415) {
      return reply.code(415).send({
        status: "failed",
        requestId: randomUUID(),
        errorCode: "INVALID_PAYLOAD"
      });
    }

    request.log.error({ err: error }, "unhandled bridge error");
    return reply.code(500).send({
      status: "failed",
      requestId: randomUUID(),
      errorCode: "INTERNAL_ERROR"
    });
  });

  await registerHealthRoute(app);
  await registerActionRoute(app, { forwardFn: deps.forwardFn });

  return app;
}
