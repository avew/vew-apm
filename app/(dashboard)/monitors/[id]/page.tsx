import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/db/client";
import { desc, eq, and, sql, gte } from "drizzle-orm";
import { isMonitorMuted } from "@/lib/maintenance";
import { uptimePct } from "@/lib/uptime";
import { loadAlertSettings } from "@/lib/alerts";
import { getT } from "@/lib/i18n-server";
import { ResponseTimeChart } from "./response-chart";
import { percentile } from "@/lib/rules";
import { DiskChart } from "./disk-chart";
import { MonitorActions } from "./monitor-actions";
import { PublicToggle } from "./public-toggle";
import { ComponentTree } from "./component-tree";
import { HealthProbes } from "./health-probes";
import { ServiceRegistry } from "./service-registry";
import { AutoRefresh } from "../../auto-refresh";
import {
  ChevronLeft,
  Activity,
  Boxes,
  HardDrive,
  Server,
  FileText,
  AlertTriangle,
  Network,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function loadMonitor(id: number) {
  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, id));
  return m ?? null;
}

async function loadRecentChecks(monitorId: number, limit: number) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.checks.id,
      checkedAt: schema.checks.checkedAt,
      overallStatus: schema.checks.overallStatus,
      responseMs: schema.checks.responseMs,
      httpStatus: schema.checks.httpStatus,
      errorText: schema.checks.errorText,
    })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.checkedAt))
    .limit(limit);
  return rows;
}

async function loadLatestComponents(monitorId: number) {
  const db = getDb();
  const [latest] = await db
    .select({ id: schema.checks.id })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.checkedAt))
    .limit(1);
  if (!latest) return { components: [] };
  const rows = await db
    .select()
    .from(schema.componentStatuses)
    .where(eq(schema.componentStatuses.checkId, latest.id));
  return { components: rows };
}

// propertySources live in the clientConfigServer component's details
function propertySourcesFrom(
  components: { path: string; details: unknown }[],
): string[] {
  const cfg = components.find((c) => c.path === "clientConfigServer");
  const ps = (cfg?.details as { propertySources?: unknown } | null)?.propertySources;
  return Array.isArray(ps) ? ps.filter((p): p is string => typeof p === "string") : [];
}

async function loadDiskHistory(monitorId: number) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      checkedAt: schema.checks.checkedAt,
      usedPct: schema.diskSnapshots.usedPct,
      totalBytes: schema.diskSnapshots.totalBytes,
      freeBytes: schema.diskSnapshots.freeBytes,
      thresholdBytes: schema.diskSnapshots.thresholdBytes,
    })
    .from(schema.diskSnapshots)
    .innerJoin(schema.checks, eq(schema.diskSnapshots.checkId, schema.checks.id))
    .where(
      and(
        eq(schema.checks.monitorId, monitorId),
        gte(schema.checks.checkedAt, since),
      ),
    )
    .orderBy(schema.checks.checkedAt);
  return rows;
}

async function loadServices(monitorId: number) {
  const db = getDb();
  const [latest] = await db
    .select({ id: schema.checks.id })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.checkedAt))
    .limit(1);
  if (!latest) return [];
  return db
    .select()
    .from(schema.serviceSnapshots)
    .where(eq(schema.serviceSnapshots.checkId, latest.id));
}

async function loadServiceRegistry(monitorId: number) {
  const db = getDb();
  return db
    .select()
    .from(schema.monitorServices)
    .where(eq(schema.monitorServices.monitorId, monitorId))
    .orderBy(schema.monitorServices.serviceName);
}

const KIND_LABEL: Record<string, string> = {
  availability: "Availability",
  disk: "Disk usage",
  latency: "Latency",
  component_down: "Component down",
  eureka: "Eureka",
  service_missing: "Service missing",
  down: "Down",
};

async function loadIncidents(monitorId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.monitorId, monitorId))
    .orderBy(desc(schema.incidents.startedAt))
    .limit(30);
  // ongoing first, then critical before warning, then most recent
  return rows.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.startedAt.getTime() - a.startedAt.getTime();
  });
}


export default async function MonitorDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const monitorId = Number(id);
  if (!Number.isFinite(monitorId)) notFound();
  const monitor = await loadMonitor(monitorId);
  if (!monitor) notFound();

  const now = new Date();
  const [
    checks,
    { components },
    disk,
    services,
    incidents,
    muted,
    day,
    week,
    month,
    alertGlobals,
  ] = await Promise.all([
    loadRecentChecks(monitorId, 300),
    loadLatestComponents(monitorId),
    loadDiskHistory(monitorId),
    loadServices(monitorId),
    loadIncidents(monitorId),
    isMonitorMuted(monitorId, now),
    uptimePct(monitorId, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    uptimePct(monitorId, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
    uptimePct(monitorId, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    loadAlertSettings(),
  ]);
  const registry = await loadServiceRegistry(monitorId);
  const propertySources = propertySourcesFrom(
    components as { path: string; details: unknown }[],
  );
  const t = await getT();

  const latencyMs = checks
    .map((c) => c.responseMs)
    .filter((v): v is number => typeof v === "number");
  const latencyStats = latencyMs.length
    ? {
        p50: percentile(latencyMs, 50),
        p95: percentile(latencyMs, 95),
        p99: percentile(latencyMs, 99),
      }
    : null;

  const certDays = monitor.certExpiresAt
    ? // server component renders once per request, so Date.now() is stable here
      // eslint-disable-next-line react-hooks/purity
      Math.round((monitor.certExpiresAt.getTime() - Date.now()) / 86_400_000)
    : null;

  const status = monitor.lastStatus ?? "UNKNOWN";
  const statusBadge =
    status === "UP"
      ? "badge-up"
      : status === "DOWN"
        ? "badge-down"
        : "badge-muted";

  const eureka = services.filter((s) => s.source === "eureka");
  const discovery = services.filter((s) => s.source !== "eureka");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-2"
        >
          <ChevronLeft className="w-4 h-4" /> {t("titleMonitors")}
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">
                {monitor.name}
              </h1>
              <span className={`badge ${statusBadge}`}>{status}</span>
              {!monitor.enabled && <span className="badge badge-muted">paused</span>}
              {muted && <span className="badge badge-warn">maintenance</span>}
              {monitor.public && <span className="badge badge-muted">public</span>}
            </div>
            <div className="text-sm text-[var(--muted)] mt-1 break-all font-mono">
              {monitor.url}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">
              interval {monitor.intervalSeconds}s · timeout {monitor.timeoutMs}ms
              {monitor.certExpiresAt && certDays !== null && (
                <>
                  {" · "}TLS cert{" "}
                  {certDays < 0 ? (
                    <span className="text-red-600 dark:text-red-400">expired</span>
                  ) : (
                    <>expires in {certDays}d</>
                  )}{" "}
                  ({monitor.certExpiresAt.toLocaleDateString()})
                </>
              )}
            </div>
          </div>
          <AutoRefresh />
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <MonitorActions
            id={monitor.id}
            enabled={monitor.enabled}
            name={monitor.name}
            url={monitor.url}
            intervalSeconds={monitor.intervalSeconds}
            group={monitor.group}
            thresholds={{
              monitorId: monitor.id,
              current: {
                diskWarnPct: monitor.diskWarnPct,
                diskCritPct: monitor.diskCritPct,
                downForMinutes: monitor.downForMinutes,
                latencyWarnMs: monitor.latencyWarnMs,
                latencyWindow: monitor.latencyWindow,
                eurekaDropAlert: monitor.eurekaDropAlert,
                serviceGraceSeconds: monitor.serviceGraceSeconds,
                componentGraceSeconds: monitor.componentGraceSeconds,
                renotifyMinutes: monitor.renotifyMinutes,
              },
              globals: {
                diskWarnPct: alertGlobals.diskWarnPct,
                diskCritPct: alertGlobals.diskCritPct,
                downForMinutes: alertGlobals.downForMinutes,
                latencyWarnMs: alertGlobals.latencyWarnMs,
                latencyWindow: alertGlobals.latencyWindow,
                eurekaDropAlert: alertGlobals.eurekaDropAlert,
                serviceGraceSeconds: alertGlobals.serviceGraceSeconds,
                componentGraceSeconds: alertGlobals.componentGraceSeconds,
                renotifyMinutes: alertGlobals.renotifyMinutes,
              },
            }}
          />
          <PublicToggle monitorId={monitor.id} initial={monitor.public} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Uptime 24h" pct={day.total ? day.upPct : null} sub={`${day.up}/${day.total} checks`} />
        <Stat label="Uptime 7d" pct={week.total ? week.upPct : null} sub={`${week.up}/${week.total} checks`} />
        <Stat label="Uptime 30d" pct={month.total ? month.upPct : null} sub={`${month.up}/${month.total} checks`} />
      </div>

      <HealthProbes
        statuses={Object.fromEntries(components.map((c) => [c.path, c.status]))}
      />

      <section className="card p-5">
        <SectionHeader icon={Activity} title={t("secResponseTime")} hint="recent 300 checks" />
        {latencyStats && (
          <div className="mb-3 flex gap-6 text-sm">
            {(
              [
                ["p50", latencyStats.p50],
                ["p95", latencyStats.p95],
                ["p99", latencyStats.p99],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  {label}
                </span>{" "}
                <span className="font-semibold tabular-nums">{Math.round(v)}ms</span>
              </div>
            ))}
          </div>
        )}
        <ResponseTimeChart
          data={checks
            .slice()
            .reverse()
            .map((c) => ({
              t: new Date(c.checkedAt).getTime(),
              ms: c.responseMs ?? null,
              status: c.overallStatus,
            }))}
        />
      </section>

      <section className="card p-5">
        <SectionHeader icon={Boxes} title={t("secComponents")} />
        <ComponentTree
          components={components.map((c) => ({
            path: c.path,
            status: c.status,
            details: c.details as Record<string, unknown> | null,
          }))}
        />
      </section>

      {disk.length > 0 && (
        <section className="card p-5">
          <SectionHeader icon={HardDrive} title={t("secDisk")} hint="24h" />
          <DiskChart
            data={disk.map((d) => ({
              t: new Date(d.checkedAt).getTime(),
              total: d.totalBytes ?? 0,
              free: d.freeBytes ?? 0,
              usedPct: d.usedPct ?? 0,
              threshold: d.thresholdBytes ?? null,
            }))}
          />
        </section>
      )}

      <section className="card p-5">
        <SectionHeader
          icon={Network}
          title={t("secServiceRegistry")}
          hint="tracked"
        />
        <p className="text-xs text-[var(--muted)] -mt-1 mb-3">
          Services are seeded on first sighting. A tracked service that stops
          appearing in the health check (past the grace window) is marked DOWN
          and raises an incident.
        </p>
        <ServiceRegistry
          monitorId={monitor.id}
          services={registry}
          latestCheckAt={checks[0] ? new Date(checks[0].checkedAt).getTime() : null}
        />
      </section>

      {eureka.length > 0 && (
        <section className="card p-5">
          <SectionHeader icon={Server} title="Eureka applications" hint={`${eureka.length}`} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-sm">
            {eureka.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${s.instanceCount === 0 ? "border-red-400/60 text-red-600 bg-red-50/50 dark:bg-red-950/20" : "border-[var(--border)]"}`}
              >
                <span className="truncate font-mono text-xs">{s.serviceName}</span>
                <span className="badge badge-up tabular-nums">{s.instanceCount}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {discovery.length > 0 && (
        <section className="card p-5">
          <SectionHeader icon={Server} title="Discovered services" hint={`${discovery.length}`} />
          <div className="flex flex-wrap gap-1.5 text-xs">
            {discovery.map((s) => (
              <span
                key={s.id}
                className="rounded-md bg-black/5 dark:bg-white/5 px-2 py-1 font-mono"
                title={s.source}
              >
                {s.serviceName}
              </span>
            ))}
          </div>
        </section>
      )}

      {propertySources.length > 0 && (
        <section className="card p-5">
          <SectionHeader icon={FileText} title="Property sources" />
          <ul className="text-xs space-y-1 font-mono">
            {propertySources.map((p, i) => (
              <li
                key={i}
                className="break-all rounded-md bg-black/5 dark:bg-white/5 px-2.5 py-1.5"
              >
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}


      <section className="card p-5">
        <SectionHeader icon={AlertTriangle} title={t("secIncidents")} />
        {incidents.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No incidents recorded.</p>
        )}
        <ul className="text-sm divide-y divide-[var(--border)]">
          {incidents.map((i) => {
            const sevBadge =
              i.severity === "warning" ? "badge-warn" : "badge-down";
            const dot =
              i.resolved
                ? "bg-emerald-500"
                : i.severity === "warning"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500 animate-pulse";
            return (
              <li
                key={i.id}
                className="flex items-start justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className={`badge ${sevBadge}`}>{i.severity}</span>
                    <span className="text-xs font-medium">
                      {KIND_LABEL[i.kind] ?? i.kind}
                    </span>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {i.componentPath ?? "overall"}
                    </span>
                    {i.suppressed && (
                      <span className="badge badge-muted">suppressed</span>
                    )}
                    {!i.resolved && <span className="badge badge-down">ongoing</span>}
                  </div>
                  {i.reason && (
                    <div className="text-xs text-[var(--muted)] mt-1 ml-4">
                      {i.reason}
                    </div>
                  )}
                </div>
                <span className="text-xs text-[var(--muted)] text-right shrink-0">
                  {new Date(i.startedAt).toLocaleString()}
                  {i.endedAt && (
                    <>
                      <br />→ {new Date(i.endedAt).toLocaleString()}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-[var(--muted)]" />
      <h2 className="font-semibold">{title}</h2>
      {hint && (
        <span className="text-xs text-[var(--muted)] bg-black/5 dark:bg-white/5 rounded-full px-2 py-0.5">
          {hint}
        </span>
      )}
    </div>
  );
}

function Stat({
  label,
  pct,
  sub,
}: {
  label: string;
  pct: number | null;
  sub: string;
}) {
  const color =
    pct === null
      ? "text-[var(--muted)]"
      : pct >= 99
        ? "text-emerald-600 dark:text-emerald-400"
        : pct >= 95
          ? "text-amber-600 dark:text-amber-400"
          : "text-red-600 dark:text-red-400";
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${color}`}>
        {pct === null ? "—" : `${pct.toFixed(2)}%`}
      </div>
      <div className="text-xs text-[var(--muted)] mt-0.5">{sub}</div>
    </div>
  );
}
