import { buildApp } from "./app.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const app = await buildApp();
await app.listen({ host: "127.0.0.1", port });
