import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "openclaw-tools-bridge" }));
}
