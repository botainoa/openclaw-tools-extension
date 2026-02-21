import type { FastifyRequest } from "fastify";

export function isAuthorized(request: FastifyRequest): boolean {
  const provided = request.headers["x-openclaw-client-key"];
  const expected = process.env.OPENCLAW_CLIENT_KEY;
  if (!expected) return false;
  return typeof provided === "string" && provided === expected;
}
