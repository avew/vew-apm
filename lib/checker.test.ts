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
let healthStatus = 200;
let webhookCalls: Record<string, unknown>[] = [];
let lastHeaders: Record<string, string> = {};

const ACTUATOR_URL = "http://svc.test/actuator/health"; // http: skips the TLS cert probe
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
    vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
      if (typeof url === "string" && url.includes("/webhook")) {
        webhookCalls.push(JSON.parse(init?.body ?? "{}"));
        return new Response("ok", { status: 200 });
      }
      lastHeaders = (init?.headers as Record<string, string>) ?? {};
      // A string body is returned raw (e.g. Prometheus text); objects → JSON.
      const isText = typeof healthBody === "string";
      return new Response(isText ? (healthBody as string) : JSON.stringify(healthBody), {
        status: healthStatus,
        headers: { "content-type": isText ? "text/plain" : "application/json" },
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
  healthStatus = 200;
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

describe("renotify + escalation", () => {
  it("re-notifies a still-open critical incident once the cadence elapses", async () => {
    const m = await createMonitor({ renotifyMinutes: 5 });
    healthBody = { status: "UP", components: { redis: { status: "DOWN" } } };
    await runCheck(m); // open → notify #1

    let incs = await incidentsFor(m.id);
    expect(incs).toHaveLength(1);
    expect(incs[0].notifyCount).toBe(1);

    // Backdate the last notification beyond the 5-minute cadence.
    await getDb()
      .update(schema.incidents)
      .set({ lastNotifiedAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(schema.incidents.id, incs[0].id));
    webhookCalls = [];

    await runCheck(m); // still DOWN → renotify
    incs = await incidentsFor(m.id);
    expect(incs[0].notifyCount).toBe(2);
    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({
      kind: "down",
      repeat: true,
      escalated: false,
    });
  });

  it("does not re-notify before the cadence elapses", async () => {
    const m = await createMonitor({ renotifyMinutes: 30 });
    healthBody = { status: "UP", components: { redis: { status: "DOWN" } } };
    await runCheck(m); // open, lastNotifiedAt ~ now
    webhookCalls = [];

    await runCheck(m); // still DOWN, cadence not elapsed
    const incs = await incidentsFor(m.id);
    expect(incs[0].notifyCount).toBe(1);
    expect(webhookCalls).toHaveLength(0);
  });

  it("re-alerts immediately when a warning escalates to critical", async () => {
    const m = await createMonitor({ renotifyMinutes: 0 }); // renotify off; escalation still fires
    healthBody = {
      status: "UP",
      components: { redis: { status: "OUT_OF_SERVICE" } },
    };
    await runCheck(m); // open as warning
    let incs = await incidentsFor(m.id);
    expect(incs[0].severity).toBe("warning");
    webhookCalls = [];

    healthBody = { status: "UP", components: { redis: { status: "DOWN" } } };
    await runCheck(m); // escalate → critical
    incs = await incidentsFor(m.id);
    expect(incs[0].severity).toBe("critical");
    expect(incs[0].notifyCount).toBe(2);
    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0]).toMatchObject({
      kind: "down",
      escalated: true,
      severity: "critical",
    });
  });

  it("never re-notifies a suppressed (maintenance) incident", async () => {
    const m = await createMonitor({ renotifyMinutes: 5 });
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
    await runCheck(m); // open suppressed, no notify

    let incs = await incidentsFor(m.id);
    expect(incs[0].suppressed).toBe(true);
    await getDb()
      .update(schema.incidents)
      .set({ lastNotifiedAt: new Date(Date.now() - 10 * 60_000) }) // overdue
      .where(eq(schema.incidents.id, incs[0].id));
    webhookCalls = [];

    await runCheck(m);
    incs = await incidentsFor(m.id);
    expect(webhookCalls).toHaveLength(0);
  });
});

describe("generic monitor types", () => {
  async function lastStatus(id: number) {
    const [m] = await getDb()
      .select()
      .from(schema.monitors)
      .where(eq(schema.monitors.id, id));
    return m.lastStatus;
  }

  it("http: UP on 2xx, DOWN on 5xx", async () => {
    const m = await createMonitor({ type: "http" });
    await runCheck(m);
    expect(await lastStatus(m.id)).toBe("UP");

    healthStatus = 503;
    const m2 = await createMonitor({ type: "http" });
    await runCheck(m2);
    expect(await lastStatus(m2.id)).toBe("DOWN");
  });

  it("http: keyword must be present", async () => {
    healthBody = { msg: "pong" };
    const ok = await createMonitor({ type: "http", keyword: "pong" });
    const bad = await createMonitor({ type: "http", keyword: "zzz" });
    await runCheck(ok);
    await runCheck(bad);
    expect(await lastStatus(ok.id)).toBe("UP");
    expect(await lastStatus(bad.id)).toBe("DOWN");
  });

  it("json: status from a path", async () => {
    healthBody = { health: "green" };
    const up = await createMonitor({ type: "json", statusPath: "$.health", statusUpValue: "green" });
    await runCheck(up);
    expect(await lastStatus(up.id)).toBe("UP");

    healthBody = { health: "red" };
    const down = await createMonitor({ type: "json", statusPath: "$.health", statusUpValue: "green" });
    await runCheck(down);
    expect(await lastStatus(down.id)).toBe("DOWN");
  });
});

describe("request auth headers", () => {
  it("sends Bearer / Basic / custom header / none per authType", async () => {
    const bearer = await createMonitor({ type: "http", authType: "bearer", authHeaderValue: "tok-123" });
    await runCheck(bearer);
    expect(lastHeaders.Authorization).toBe("Bearer tok-123");

    const basic = await createMonitor({ type: "http", authType: "basic", authUsername: "alice", authHeaderValue: "pw" });
    await runCheck(basic);
    expect(lastHeaders.Authorization).toBe("Basic " + Buffer.from("alice:pw").toString("base64"));

    const hdr = await createMonitor({ type: "http", authType: "header", authHeaderName: "X-Key", authHeaderValue: "abc" });
    await runCheck(hdr);
    expect(lastHeaders["X-Key"]).toBe("abc");

    const none = await createMonitor({ type: "http", authType: "none" });
    await runCheck(none);
    expect(lastHeaders.Authorization).toBeUndefined();
  });
});

describe("service snapshot delta storage", () => {
  const eurekaBody = (apps: Record<string, number>) => ({
    status: "UP",
    components: {
      discoveryComposite: {
        status: "UP",
        components: {
          eureka: { status: "UP", details: { applications: apps } },
        },
      },
    },
  });

  function serviceRows(monitorId: number) {
    return getDb()
      .select({ checkId: schema.serviceSnapshots.checkId })
      .from(schema.serviceSnapshots)
      .innerJoin(schema.checks, eq(schema.serviceSnapshots.checkId, schema.checks.id))
      .where(eq(schema.checks.monitorId, monitorId));
  }

  it("snapshots once, skips unchanged checks, re-snapshots on change", async () => {
    healthBody = eurekaBody({ "SVC-A": 1, "SVC-B": 2 });
    const m = await createMonitor();

    await runCheck(m); // baseline → snapshot
    let rows = await serviceRows(m.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.checkId)).size).toBe(1);

    await runCheck(m); // identical → NO new snapshot
    rows = await serviceRows(m.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.checkId)).size).toBe(1);

    healthBody = eurekaBody({ "SVC-A": 1, "SVC-B": 3 }); // instance count changed
    await runCheck(m); // → new snapshot
    rows = await serviceRows(m.id);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.checkId)).size).toBe(2);

    // 3 checks recorded, but only 2 carry service rows (delta).
    const checks = await getDb()
      .select()
      .from(schema.checks)
      .where(eq(schema.checks.monitorId, m.id));
    expect(checks).toHaveLength(3);
  });
});

describe("prometheus monitor", () => {
  it("stores a metric sample and opens a critical metric incident on breach", async () => {
    healthBody = 'jvm_memory_used_bytes{area="heap"} 1500000000\nhikaricp_connections_active 12\n';
    const m = await createMonitor({ type: "prometheus" });
    const [rule] = await getDb()
      .insert(schema.metricRules)
      .values({
        monitorId: m.id,
        label: "heap used",
        metricName: "jvm_memory_used_bytes",
        labelMatchers: { area: "heap" },
        operator: "gt",
        warnValue: 500_000_000,
        critValue: 1_000_000_000,
        enabled: true,
      })
      .returning();

    await runCheck(m);

    const samples = await getDb()
      .select()
      .from(schema.metricSamples)
      .where(eq(schema.metricSamples.ruleId, rule.id));
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(1_500_000_000);

    const inc = (await incidentsFor(m.id)).find((i) => i.kind === "metric");
    expect(inc?.severity).toBe("critical");
    expect(inc?.componentPath).toBe("heap used");
    expect(webhookCalls.some((w) => w.alertKind === "metric")).toBe(true);

    const [mon] = await getDb().select().from(schema.monitors).where(eq(schema.monitors.id, m.id));
    expect(mon.lastStatus).toBe("UP"); // metric breach does not mark the monitor down
  });

  it("stores the sample but opens no incident when under thresholds", async () => {
    healthBody = "hikaricp_connections_active 3\n";
    const m = await createMonitor({ type: "prometheus" });
    const [rule] = await getDb()
      .insert(schema.metricRules)
      .values({
        monitorId: m.id,
        label: "active conns",
        metricName: "hikaricp_connections_active",
        operator: "gt",
        warnValue: 40,
        critValue: 45,
        enabled: true,
      })
      .returning();

    await runCheck(m);

    const samples = await getDb()
      .select()
      .from(schema.metricSamples)
      .where(eq(schema.metricSamples.ruleId, rule.id));
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(3);
    expect((await incidentsFor(m.id)).find((i) => i.kind === "metric")).toBeUndefined();
  });
});
