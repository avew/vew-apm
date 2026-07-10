import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Integration test for the check pipeline: runCheck → fetchHealth (mocked) →
 * parser → rules → incident reconciliation → notifier (real dispatch over a
 * mocked fetch, so channel decryption is exercised too). Uses a real temp-file
 * SQLite DB with the committed drizzle schema applied.
 */

// Loaded after DATABASE_URL/ENCRYPTION_KEY are set (getDb caches on first call).
let runCheck: typeof import("./checker").runCheck;
let getDb: typeof import("./db/client").getDb;
let schema: typeof import("./db/client").schema;
let encryptSecret: typeof import("./crypto").encryptSecret;

let dbDir: string;

// Mutable state the mocked fetch reads.
let healthBody: unknown = { status: "UP", components: {} };
let webhookCalls: Record<string, unknown>[] = [];

const ACTUATOR_URL = "https://svc.test/actuator/health";
const WEBHOOK_URL = "https://hooks.test/webhook";

beforeAll(async () => {
  dbDir = mkdtempSync(path.join(tmpdir(), "apm-it-"));
  process.env.DATABASE_URL = path.join(dbDir, "it.db");
  process.env.ENCRYPTION_KEY = "integration-test-key";

  // Apply the committed schema on a throwaway connection.
  const raw = new Database(process.env.DATABASE_URL);
  const drz = path.resolve("drizzle");
  for (const f of readdirSync(drz).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(path.join(drz, f), "utf8"));
  }
  raw.close();

  ({ runCheck } = await import("./checker"));
  ({ getDb, schema } = await import("./db/client"));
  ({ encryptSecret } = await import("./crypto"));

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (typeof url === "string" && url.includes("/webhook")) {
        webhookCalls.push(JSON.parse(init?.body ?? "{}"));
        return new Response("ok", { status: 200 });
      }
      return new Response(JSON.stringify(healthBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );

  // One global, enabled webhook channel with an encrypted config → every alert
  // routes through the real notifier and decrypts the channel on the way out.
  await getDb()
    .insert(schema.notificationChannels)
    .values({
      name: "wh",
      kind: "webhook",
      config: encryptSecret({ url: WEBHOOK_URL }) as unknown as object,
      enabled: true,
    });
});

afterAll(() => {
  vi.unstubAllGlobals();
  try {
    rmSync(dbDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

beforeEach(() => {
  webhookCalls = [];
  healthBody = { status: "UP", components: {} };
});

// Fresh monitor per test → row isolation without truncating shared tables.
// grace 0 so a single bad check trips component/service rules immediately.
async function createMonitor(
  overrides: Partial<typeof schema.monitors.$inferInsert> = {},
) {
  const [m] = await getDb()
    .insert(schema.monitors)
    .values({
      name: "svc",
      url: ACTUATOR_URL,
      method: "GET",
      intervalSeconds: 60,
      timeoutMs: 5000,
      enabled: true,
      componentGraceSeconds: 0,
      serviceGraceSeconds: 0,
      ...overrides,
    })
    .returning();
  return m;
}

function incidentsFor(monitorId: number) {
  return getDb()
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.monitorId, monitorId));
}

describe("runCheck integration", () => {
  it("persists a healthy check and opens no incident", async () => {
    healthBody = {
      status: "UP",
      components: { redis: { status: "UP" }, ping: { status: "UP" } },
    };
    const m = await createMonitor();
    await runCheck(m);

    const checks = await getDb()
      .select()
      .from(schema.checks)
      .where(eq(schema.checks.monitorId, m.id));
    expect(checks).toHaveLength(1);
    expect(checks[0].overallStatus).toBe("UP");
    expect(checks[0].muted).toBe(false);

    const comps = await getDb()
      .select()
      .from(schema.componentStatuses)
      .where(eq(schema.componentStatuses.checkId, checks[0].id));
    expect(comps.length).toBeGreaterThanOrEqual(2);

    expect(await incidentsFor(m.id)).toHaveLength(0);
    expect(webhookCalls).toHaveLength(0);

    const [mon] = await getDb()
      .select()
      .from(schema.monitors)
      .where(eq(schema.monitors.id, m.id));
    expect(mon.lastStatus).toBe("UP");
  });

  it("opens a critical incident and notifies when a component is DOWN", async () => {
    healthBody = {
      status: "UP",
      components: { redis: { status: "DOWN", details: { error: "refused" } } },
    };
    const m = await createMonitor();
    await runCheck(m);

    const incs = await incidentsFor(m.id);
    expect(incs).toHaveLength(1);
    expect(incs[0]).toMatchObject({
      kind: "component_down",
      severity: "critical",
      componentPath: "redis",
      resolved: false,
      suppressed: false,
    });

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({
      kind: "down",
      alertKind: "component_down",
      severity: "critical",
    });
  });

  it("resolves the incident and notifies recovery when the component comes back UP", async () => {
    const m = await createMonitor();
    healthBody = { status: "UP", components: { redis: { status: "DOWN" } } };
    await runCheck(m); // open

    webhookCalls = []; // isolate the recovery notification
    healthBody = { status: "UP", components: { redis: { status: "UP" } } };
    await runCheck(m); // resolve

    const incs = await incidentsFor(m.id);
    expect(incs).toHaveLength(1);
    expect(incs[0].resolved).toBe(true);
    expect(incs[0].endedAt).not.toBeNull();

    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({
      kind: "resolved",
      alertKind: "component_down",
    });
  });

  it("opens a disk warning from usedPct thresholds", async () => {
    healthBody = {
      status: "UP",
      components: {
        diskSpace: {
          status: "UP",
          details: { total: 100, free: 30, threshold: 10 },
        },
      },
    };
    const m = await createMonitor();
    await runCheck(m);

    const incs = await incidentsFor(m.id);
    expect(incs).toHaveLength(1);
    expect(incs[0]).toMatchObject({
      kind: "disk",
      severity: "warning",
      componentPath: "diskSpace",
    });
    expect(incs[0].metricValue).toBeCloseTo(70, 0);
    expect(incs[0].reason).toContain("%");
  });

  it("suppresses the incident and skips notifying during a maintenance window", async () => {
    const m = await createMonitor();
    await getDb()
      .insert(schema.maintenanceWindows)
      .values({
        name: "mw",
        scope: "monitor",
        monitorId: m.id,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        recurrence: "none",
      });

    healthBody = { status: "UP", components: { redis: { status: "DOWN" } } };
    await runCheck(m);

    const incs = await incidentsFor(m.id);
    expect(incs).toHaveLength(1);
    expect(incs[0].suppressed).toBe(true);
    expect(incs[0].resolved).toBe(false);
    expect(webhookCalls).toHaveLength(0);

    const checks = await getDb()
      .select()
      .from(schema.checks)
      .where(eq(schema.checks.monitorId, m.id));
    expect(checks[0].muted).toBe(true);
  });
});
