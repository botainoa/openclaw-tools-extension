import Fastify from "fastify";
import { registerHealthRoute } from "./routes/health.js";
import { registerActionRoute } from "./routes/action.js";

const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

await registerHealthRoute(app);
await registerActionRoute(app);

const port = Number(process.env.BRIDGE_PORT ?? 8787);
await app.listen({ host: "127.0.0.1", port });
