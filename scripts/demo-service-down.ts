import "dotenv/config";
import { getDb, schema } from "../lib/db/client";
import { eq, and, desc } from "drizzle-orm";
import { runCheck } from "../lib/checker";
import { updateAlertSettings } from "../lib/alerts";

const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const NAME = "Service-down demo";

async function main() {
  const db = getDb();

  // grace 0 so the demo fires immediately
  await updateAlertSettings({ serviceGraceSeconds: 0 });

  // fresh monitor pointing at the fixture
  await db.delete(schema.monitors).where(eq(schema.monitors.name, NAME));
  const [m] = await db
    .insert(schema.monitors)
    .values({
      name: NAME,
      url: `${BASE}/api/fixture/health`,
      method: "GET",
      intervalSeconds: 3600,
      timeoutMs: 5000,
      enabled: true,
    })
    .returning();
  console.log(`monitor #${m.id}`);

  const openMissing = async () =>
    db
      .select()
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.monitorId, m.id),
          eq(schema.incidents.kind, "service_missing"),
        ),
      )
      .orderBy(desc(schema.incidents.id));

  // 1. all up → seed registry
  await fetch(`${BASE}/api/fixture/health?restore=all`);
  await runCheck(m);
  const reg1 = await db
    .select()
    .from(schema.monitorServices)
    .where(eq(schema.monitorServices.monitorId, m.id));
  console.log(`after 1st check: ${reg1.length} services registered, all present=${reg1.every((r) => r.present)}`);

  // 2. drop admin-console-svc → should create a service_missing incident
  await fetch(`${BASE}/api/fixture/health?drop=admin-console-svc`);
  await runCheck(m);
  const inc = await openMissing();
  console.log(
    `after drop: incidents=${inc.length}`,
    inc.map((i) => `[${i.severity}] ${i.componentPath} resolved=${i.resolved} — ${i.reason}`),
  );
  const down = await db
    .select()
    .from(schema.monitorServices)
    .where(
      and(
        eq(schema.monitorServices.monitorId, m.id),
        eq(schema.monitorServices.present, false),
      ),
    );
  console.log(`registry down:`, down.map((d) => `${d.serviceName}`));

  // 3. restore → incident should resolve
  await fetch(`${BASE}/api/fixture/health?restore=all`);
  await runCheck(m);
  const inc2 = await openMissing();
  console.log(
    `after restore:`,
    inc2.map((i) => `${i.componentPath} resolved=${i.resolved}`),
  );

  // cleanup
  await db.delete(schema.monitors).where(eq(schema.monitors.id, m.id));
  await updateAlertSettings({ serviceGraceSeconds: 30 });
  console.log("cleaned up, grace restored to 30s");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
