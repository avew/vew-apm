import "dotenv/config";
import { getDb, schema } from "../lib/db/client";
import { eq } from "drizzle-orm";
import { sampleHealth } from "../lib/fixtures/sample-health";

const TOTAL_BYTES = 82_086_711_296;
const THRESHOLD = 10_485_760;

async function main() {
  const db = getDb();
  const now = Date.now();

  // Reuse or create monitor
  const [existing] = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.name, "Demo — api-gateway"));
  let monitorId: number;
  if (existing) {
    monitorId = existing.id;
    console.log(`Reusing monitor #${monitorId}`);
    await db
      .delete(schema.checks)
      .where(eq(schema.checks.monitorId, monitorId));
    await db
      .delete(schema.incidents)
      .where(eq(schema.incidents.monitorId, monitorId));
    await db
      .delete(schema.monitorServices)
      .where(eq(schema.monitorServices.monitorId, monitorId));
  } else {
    const [inserted] = await db
      .insert(schema.monitors)
      .values({
        name: "Demo — api-gateway",
        url: "http://localhost:3000/api/fixture/health",
        method: "GET",
        intervalSeconds: 60,
        timeoutMs: 5000,
        enabled: true,
        lastStatus: "UP",
      })
      .returning({ id: schema.monitors.id });
    monitorId = inserted.id;
    console.log(`Created monitor #${monitorId}`);
  }

  const services = Object.keys(
    (sampleHealth.components.discoveryComposite.components.eureka.details as {
      applications: Record<string, number>;
    }).applications,
  );

  const total = 24 * 60; // 24 hours * 60 minutes = 1440 checks

  // Windows:
  // 0..900       : healthy, disk 40% -> 75% (linear)
  // 900..1050    : disk climbing 75% -> 96% (redis still OK)
  // 1050..1080   : redis DOWN (component incident)
  // 1080..1200   : overall DOWN (storage full → gateway crashed)
  // 1200..end    : recovered, disk drops to 55%
  const overallDownStart = new Date(now - (total - 1080) * 60_000);
  const overallDownEnd = new Date(now - (total - 1200) * 60_000);
  const redisDownStart = new Date(now - (total - 1050) * 60_000);
  const redisDownEnd = new Date(now - (total - 1080) * 60_000);

  for (let i = 0; i < total; i++) {
    const checkedAt = new Date(now - (total - i) * 60_000);
    let usedPct: number;
    if (i < 900) usedPct = 40 + (i / 900) * 35;
    else if (i < 1050) usedPct = 75 + ((i - 900) / 150) * 21;
    else if (i < 1200) usedPct = 96 + Math.random() * 2;
    else usedPct = 55 + Math.random() * 3;

    const isOverallDown = i >= 1080 && i < 1200;
    const isRedisDown = i >= 1050 && i < 1080;
    const overallStatus = isOverallDown ? "DOWN" : "UP";

    const usedBytes = Math.floor((usedPct / 100) * TOTAL_BYTES);
    const freeBytes = TOTAL_BYTES - usedBytes;

    const [check] = await db
      .insert(schema.checks)
      .values({
        monitorId,
        checkedAt,
        overallStatus,
        responseMs: isOverallDown
          ? 5000
          : 40 + Math.floor(Math.random() * 60) + (usedPct > 90 ? 80 : 0),
        httpStatus: isOverallDown ? 503 : 200,
        errorText: isOverallDown ? "HTTP 503" : null,
        rawJson: isOverallDown
          ? { status: "DOWN" }
          : (sampleHealth as unknown as object),
      })
      .returning({ id: schema.checks.id });

    const componentsList: {
      path: string;
      status: string;
      details: object | null;
    }[] = [
      { path: "clientConfigServer", status: "UP", details: null },
      { path: "discoveryComposite", status: "UP", details: null },
      { path: "discoveryComposite.discoveryClient", status: "UP", details: null },
      { path: "discoveryComposite.eureka", status: "UP", details: null },
      {
        path: "diskSpace",
        status: usedPct > 95 ? "DOWN" : "UP",
        details: {
          total: TOTAL_BYTES,
          free: freeBytes,
          threshold: THRESHOLD,
          path: "/.",
          exists: true,
        },
      },
      { path: "livenessState", status: "UP", details: null },
      { path: "ping", status: "UP", details: null },
      { path: "readinessState", status: "UP", details: null },
      {
        path: "redis",
        status: isRedisDown || isOverallDown ? "DOWN" : "UP",
        details: { version: "7.4.7" },
      },
      { path: "refreshScope", status: "UP", details: null },
    ];

    await db.insert(schema.componentStatuses).values(
      componentsList.map((c) => ({
        checkId: check.id,
        path: c.path,
        status: isOverallDown ? "DOWN" : c.status,
        details: c.details ?? undefined,
      })),
    );

    await db.insert(schema.diskSnapshots).values({
      checkId: check.id,
      diskPath: "/.",
      totalBytes: TOTAL_BYTES,
      freeBytes,
      usedPct,
      thresholdBytes: THRESHOLD,
    });

    if (!isOverallDown) {
      await db.insert(schema.serviceSnapshots).values(
        services.map((s) => ({
          checkId: check.id,
          source: "eureka",
          serviceName: s,
          instanceCount: 1,
        })),
      );
    }
  }

  await db.insert(schema.incidents).values([
    {
      monitorId,
      componentPath: "diskSpace",
      kind: "disk",
      severity: "warning",
      metricValue: 78,
      threshold: 60,
      reason: "disk 78.0% ≥ 60%",
      startedAt: new Date(now - (total - 900) * 60_000),
      endedAt: new Date(now - (total - 1080) * 60_000),
      resolved: true,
      suppressed: false,
    },
    {
      monitorId,
      componentPath: "redis",
      kind: "component_down",
      severity: "critical",
      reason: "redis is DOWN",
      startedAt: redisDownStart,
      endedAt: redisDownEnd,
      resolved: true,
      suppressed: false,
    },
    {
      monitorId,
      componentPath: null,
      kind: "availability",
      severity: "critical",
      metricValue: 120,
      threshold: 3,
      reason: "down 120m (≥ 3m) — storage full, gateway crashed",
      startedAt: overallDownStart,
      endedAt: overallDownEnd,
      resolved: true,
      suppressed: false,
    },
    {
      monitorId,
      componentPath: "diskSpace",
      kind: "disk",
      severity: "critical",
      metricValue: 96,
      threshold: 85,
      reason: "disk 96.0% ≥ 85%",
      startedAt: new Date(now - 30 * 60_000),
      endedAt: null,
      resolved: false,
      suppressed: false,
    },
  ]);

  // Seed the service registry: all current services present (seeded on first
  // sight), plus one that has gone missing → DOWN for the demo.
  const registrySince = new Date(now - 25 * 60_000);
  const presentServices = services.filter((s) => s !== "ADMIN-CONSOLE-SVC");
  await db.insert(schema.monitorServices).values([
    ...presentServices.map((s) => ({
      monitorId,
      serviceName: s,
      source: "eureka",
      present: true,
      tracked: true,
      firstSeenAt: new Date(now - total * 60_000),
      lastSeenAt: new Date(now),
    })),
    {
      monitorId,
      serviceName: "ADMIN-CONSOLE-SVC",
      source: "eureka",
      present: false,
      tracked: true,
      firstSeenAt: new Date(now - total * 60_000),
      lastSeenAt: registrySince,
    },
  ]);
  await db.insert(schema.incidents).values({
    monitorId,
    componentPath: "service:ADMIN-CONSOLE-SVC",
    kind: "service_missing",
    severity: "warning",
    reason:
      "ADMIN-CONSOLE-SVC is down — was registered but missing from the health check",
    startedAt: registrySince,
    endedAt: null,
    resolved: false,
    suppressed: false,
  });

  // Update monitor lastStatus to reflect final tail
  await db
    .update(schema.monitors)
    .set({
      lastStatus: "UP",
      nextCheckAt: new Date(now + 60_000),
      updatedAt: new Date(),
    })
    .where(eq(schema.monitors.id, monitorId));

  console.log(
    `Seeded ${total} checks + 4 incidents (disk warn→crit, redis down, availability outage, ongoing disk critical).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
