import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let pruneOldIncidents: typeof import("./retention").pruneOldIncidents;
let getDb: typeof import("./db/client").getDb;
let schema: typeof import("./db/client").schema;

let monitorId: number;

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "apm-ret-"));
  process.env.DATABASE_URL = path.join(dir, "ret.db");
  const raw = new Database(process.env.DATABASE_URL);
  const drz = path.resolve("drizzle");
  for (const f of readdirSync(drz).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(path.join(drz, f), "utf8"));
  }
  raw.close();

  ({ pruneOldIncidents } = await import("./retention"));
  ({ getDb, schema } = await import("./db/client"));

  const [m] = await getDb()
    .insert(schema.monitors)
    .values({ name: "svc", url: "http://x", enabled: true })
    .returning({ id: schema.monitors.id });
  monitorId = m.id;

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  await getDb()
    .insert(schema.incidents)
    .values([
      // old + resolved → should be pruned
      { monitorId, kind: "disk", severity: "warning", startedAt: daysAgo(40), endedAt: daysAgo(40), resolved: true },
      // old but still OPEN → must be kept
      { monitorId, kind: "availability", severity: "critical", startedAt: daysAgo(40), resolved: false },
      // recent + resolved → must be kept
      { monitorId, kind: "latency", severity: "warning", startedAt: daysAgo(2), endedAt: daysAgo(2), resolved: true },
    ]);
});

describe("pruneOldIncidents", () => {
  it("deletes only old resolved incidents, keeps open + recent", async () => {
    const removed = await pruneOldIncidents(30);
    expect(removed).toBe(1);

    const rows = await getDb()
      .select()
      .from(schema.incidents)
      .where(eq(schema.incidents.monitorId, monitorId));
    expect(rows).toHaveLength(2);
    // the surviving old one is the still-open incident
    expect(rows.some((r) => !r.resolved)).toBe(true);
    expect(rows.every((r) => r.kind !== "disk")).toBe(true);
  });

  it("is a no-op when retentionDays is 0 (keep forever)", async () => {
    expect(await pruneOldIncidents(0)).toBe(0);
  });
});
