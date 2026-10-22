// WhyTrace mail-gateway mock. Fastify REST that serves the three endpoints
// Zetaris registers as REST tables. Payloads come from data/mailgw/*.json
// (written by the Postgres seeder) so one deterministic generator feeds both.
import Fastify from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const PORT = Number(process.env.MAILGW_PORT ?? 8090);
const DATA_DIR = process.env.MAILGW_DATA_DIR ?? resolvePath("/app", "..", "..", "data", "mailgw");

function load(file: string): { data: unknown[] } {
  const path = resolvePath(DATA_DIR, file);
  if (!existsSync(path)) return { data: [] };
  const raw = readFileSync(path, "utf8");
  try {
    const parsed = JSON.parse(raw) as { data?: unknown[] };
    return { data: parsed.data ?? [] };
  } catch {
    return { data: [] };
  }
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.get("/healthz", async () => ({ ok: true, service: "whytrace-mailgw" }));
app.get("/mailgw/deliveries", async () => load("deliveries.json"));
app.get("/mailgw/clicks", async () => load("clicks.json"));
app.get("/mailgw/rules", async () => load("rules.json"));

app.listen({ host: "0.0.0.0", port: PORT }).then(() => {
  app.log.info(`mailgw listening on 0.0.0.0:${PORT}, data dir ${DATA_DIR}`);
}).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
