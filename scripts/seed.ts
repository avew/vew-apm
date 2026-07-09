import "dotenv/config";
import { getDb, schema } from "../lib/db/client";

async function main() {
  const db = getDb();
  const url =
    process.env.SEED_URL ?? "http://localhost:3000/api/_fixture/health";
  await db.insert(schema.monitors).values({
    name: "Local fixture (api-gateway)",
    url,
    method: "GET",
    intervalSeconds: 30,
    timeoutMs: 5000,
    enabled: true,
  });
  console.log("Seeded monitor →", url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
