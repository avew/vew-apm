import { getDb, schema } from "@/lib/db/client";
import { eq, desc, sql } from "drizzle-orm";
import { getSchedulerStatus } from "@/lib/scheduler";

export interface MetricsMonitor {
  id: number;
  name: string;
  group: string | null;
  up: 1 | 0 | null; // null = never checked (omitted from output)
  responseMs: number | null;
  lastCheckAtMs: number | null;
  certDaysLeft: number | null;
  disks: { path: string; usedPct: number }[];
}

export interface MetricsSnapshot {
  schedulerLastTickAtMs: number;
  monitorsTotal: number;
  monitors: MetricsMonitor[];
  incidentsOpen: { critical: number; warning: number };
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function labels(pairs: Record<string, string | number>): string {
  const parts = Object.entries(pairs)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => `${k}="${escapeLabel(String(v))}"`);
  return parts.length ? `{${parts.join(",")}}` : "";
}

/** Render a snapshot into Prometheus text exposition format (v0.0.4). Pure. */
export function buildMetricsText(s: MetricsSnapshot): string {
  const out: string[] = [];
  const line = (name: string, lbls: string, val: number) =>
    out.push(`${name}${lbls} ${val}`);

  out.push("# HELP apm_up Whether this Vew APM instance is up.");
  out.push("# TYPE apm_up gauge");
  out.push("apm_up 1");

  out.push(
    "# HELP apm_scheduler_last_tick_timestamp_seconds Unix time of the scheduler's last tick (0 if never).",
  );
  out.push("# TYPE apm_scheduler_last_tick_timestamp_seconds gauge");
  out.push(
    `apm_scheduler_last_tick_timestamp_seconds ${Math.floor(s.schedulerLastTickAtMs / 1000)}`,
  );

  out.push("# HELP apm_monitors_total Number of configured monitors.");
  out.push("# TYPE apm_monitors_total gauge");
  out.push(`apm_monitors_total ${s.monitorsTotal}`);

  out.push(
    "# HELP apm_monitor_up Whether the monitor's last check was UP (1) or DOWN (0). Absent until first checked.",
  );
  out.push("# TYPE apm_monitor_up gauge");
  for (const m of s.monitors) {
    if (m.up === null) continue;
    line("apm_monitor_up", labels({ monitor: m.name, id: m.id, group: m.group ?? "" }), m.up);
  }

  out.push(
    "# HELP apm_monitor_response_ms Latency of the monitor's most recent check, in milliseconds.",
  );
  out.push("# TYPE apm_monitor_response_ms gauge");
  for (const m of s.monitors) {
    if (m.responseMs === null) continue;
    line("apm_monitor_response_ms", labels({ monitor: m.name, id: m.id }), m.responseMs);
  }

  out.push(
    "# HELP apm_monitor_last_check_timestamp_seconds Unix time of the monitor's most recent check.",
  );
  out.push("# TYPE apm_monitor_last_check_timestamp_seconds gauge");
  for (const m of s.monitors) {
    if (m.lastCheckAtMs === null) continue;
    line(
      "apm_monitor_last_check_timestamp_seconds",
      labels({ monitor: m.name, id: m.id }),
      Math.floor(m.lastCheckAtMs / 1000),
    );
  }

  out.push(
    "# HELP apm_monitor_disk_used_percent Disk usage percent from the monitor's most recent check.",
  );
  out.push("# TYPE apm_monitor_disk_used_percent gauge");
  for (const m of s.monitors) {
    for (const d of m.disks) {
      line(
        "apm_monitor_disk_used_percent",
        labels({ monitor: m.name, id: m.id, path: d.path }),
        Number(d.usedPct.toFixed(2)),
      );
    }
  }

  out.push(
    "# HELP apm_monitor_cert_days_left Days until the monitor's TLS certificate expires (negative if expired).",
  );
  out.push("# TYPE apm_monitor_cert_days_left gauge");
  for (const m of s.monitors) {
    if (m.certDaysLeft === null) continue;
    line("apm_monitor_cert_days_left", labels({ monitor: m.name, id: m.id }), m.certDaysLeft);
  }

  out.push("# HELP apm_incidents_open Number of open (unresolved) incidents by severity.");
  out.push("# TYPE apm_incidents_open gauge");
  line("apm_incidents_open", labels({ severity: "critical" }), s.incidentsOpen.critical);
  line("apm_incidents_open", labels({ severity: "warning" }), s.incidentsOpen.warning);

  return out.join("\n") + "\n";
}

/** Gather the current metrics snapshot from the DB + scheduler liveness. */
export async function collectMetrics(nowMs = Date.now()): Promise<MetricsSnapshot> {
  const db = getDb();
  const mons = await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      group: schema.monitors.group,
      lastStatus: schema.monitors.lastStatus,
      certExpiresAt: schema.monitors.certExpiresAt,
    })
    .from(schema.monitors);

  const monitors: MetricsMonitor[] = [];
  for (const m of mons) {
    const [latest] = await db
      .select({
        id: schema.checks.id,
        checkedAt: schema.checks.checkedAt,
        responseMs: schema.checks.responseMs,
      })
      .from(schema.checks)
      .where(eq(schema.checks.monitorId, m.id))
      .orderBy(desc(schema.checks.checkedAt))
      .limit(1);

    let disks: { path: string; usedPct: number }[] = [];
    if (latest) {
      const rows = await db
        .select({
          diskPath: schema.diskSnapshots.diskPath,
          usedPct: schema.diskSnapshots.usedPct,
        })
        .from(schema.diskSnapshots)
        .where(eq(schema.diskSnapshots.checkId, latest.id));
      disks = rows
        .filter((r): r is { diskPath: string | null; usedPct: number } => r.usedPct != null)
        .map((r) => ({ path: r.diskPath ?? "disk", usedPct: r.usedPct }));
    }

    monitors.push({
      id: m.id,
      name: m.name,
      group: m.group,
      up: m.lastStatus === "UP" ? 1 : m.lastStatus === "DOWN" ? 0 : null,
      responseMs: latest?.responseMs ?? null,
      lastCheckAtMs: latest ? latest.checkedAt.getTime() : null,
      certDaysLeft: m.certExpiresAt
        ? Math.round((m.certExpiresAt.getTime() - nowMs) / 86_400_000)
        : null,
      disks,
    });
  }

  const incRows = await db
    .select({ severity: schema.incidents.severity, count: sql<number>`count(*)` })
    .from(schema.incidents)
    .where(eq(schema.incidents.resolved, false))
    .groupBy(schema.incidents.severity);
  const incidentsOpen = { critical: 0, warning: 0 };
  for (const r of incRows) {
    if (r.severity === "critical") incidentsOpen.critical = Number(r.count);
    else if (r.severity === "warning") incidentsOpen.warning = Number(r.count);
  }

  return {
    schedulerLastTickAtMs: getSchedulerStatus().lastTickAt ?? 0,
    monitorsTotal: mons.length,
    monitors,
    incidentsOpen,
  };
}

export async function renderMetrics(): Promise<string> {
  return buildMetricsText(await collectMetrics());
}
