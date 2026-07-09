import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { desc, eq, and, sql, gte } from "drizzle-orm";
import { listActiveWindows } from "@/lib/maintenance";
import { getT } from "@/lib/i18n-server";
import { Plus, Wrench } from "lucide-react";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

async function loadMonitors() {
  const db = getDb();
  return db
    .select()
    .from(schema.monitors)
    .orderBy(desc(schema.monitors.createdAt));
}

async function loadRecentChecks(monitorId: number, limit = 60) {
  const db = getDb();
  return db
    .select({
      id: schema.checks.id,
      checkedAt: schema.checks.checkedAt,
      overallStatus: schema.checks.overallStatus,
      responseMs: schema.checks.responseMs,
    })
    .from(schema.checks)
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.checkedAt))
    .limit(limit);
}

async function loadUptime(monitorId: number) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      up: sql<number>`COUNT(*) FILTER (WHERE ${schema.checks.overallStatus} = 'UP')`,
    })
    .from(schema.checks)
    .where(
      and(
        eq(schema.checks.monitorId, monitorId),
        gte(schema.checks.checkedAt, since),
      ),
    );
  const total = row?.total ?? 0;
  const up = row?.up ?? 0;
  return {
    total,
    up,
    pct: total > 0 ? (up / total) * 100 : null,
  };
}

async function loadDisk(monitorId: number) {
  const db = getDb();
  const [row] = await db
    .select({
      usedPct: schema.diskSnapshots.usedPct,
      totalBytes: schema.diskSnapshots.totalBytes,
      freeBytes: schema.diskSnapshots.freeBytes,
    })
    .from(schema.diskSnapshots)
    .innerJoin(schema.checks, eq(schema.diskSnapshots.checkId, schema.checks.id))
    .where(eq(schema.checks.monitorId, monitorId))
    .orderBy(desc(schema.checks.checkedAt))
    .limit(1);
  return row ?? null;
}

async function loadActiveAlerts(monitorId: number) {
  const db = getDb();
  const rows = await db
    .select({ severity: schema.incidents.severity })
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.monitorId, monitorId),
        eq(schema.incidents.resolved, false),
      ),
    );
  const critical = rows.filter((r) => r.severity === "critical").length;
  const warning = rows.filter((r) => r.severity === "warning").length;
  return { total: rows.length, critical, warning };
}

export default async function Home() {
  const monitors = await loadMonitors();
  const activeWindows = await listActiveWindows();
  const mutedMonitorIds = new Set(
    activeWindows.flatMap((w) =>
      w.scope === "global" ? [] : w.monitorId ? [w.monitorId] : [],
    ),
  );
  const globalMute = activeWindows.some((w) => w.scope === "global");

  const cards = await Promise.all(
    monitors.map(async (m) => {
      const [checks, uptime, disk, alerts] = await Promise.all([
        loadRecentChecks(m.id, 60),
        loadUptime(m.id),
        loadDisk(m.id),
        loadActiveAlerts(m.id),
      ]);
      return { monitor: m, checks, uptime, disk, alerts };
    }),
  );

  const t = await getT();
  const upCount = monitors.filter((m) => m.lastStatus === "UP").length;
  const downCount = monitors.filter((m) => m.lastStatus === "DOWN").length;
  const mutedCount = monitors.filter(
    (m) => globalMute || mutedMonitorIds.has(m.id),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("titleMonitors")}</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {monitors.length} monitor{monitors.length === 1 ? "" : "s"} ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {upCount} {t("up")}
            </span>
            {downCount > 0 && (
              <>
                {" · "}
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {downCount} {t("down")}
                </span>
              </>
            )}
            {mutedCount > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {mutedCount} {t("inMaintenance")}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh />
          <Link href="/monitors/new" className="btn btn-primary">
            <Plus className="w-4 h-4" /> {t("newMonitor")}
          </Link>
        </div>
      </div>

      {globalMute && (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 text-amber-900 px-4 py-3 text-sm dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/50">
          <div className="flex items-center gap-2 font-medium">
            <Wrench className="w-4 h-4 shrink-0" />
            Global maintenance is active — alerting paused for all monitors.
          </div>
          <ul className="mt-2 space-y-1.5 pl-6">
            {activeWindows
              .filter((w) => w.scope === "global")
              .map((w) => {
                const oneOff = w.recurrence === "none";
                const timeFmt: Intl.DateTimeFormatOptions = {
                  hour: "2-digit",
                  minute: "2-digit",
                };
                const startsAt = new Date(w.startsAt);
                const endsAt = new Date(w.endsAt);
                const remainingMin = Math.max(
                  0,
                  Math.round((endsAt.getTime() - Date.now()) / 60000),
                );
                const remaining =
                  remainingMin >= 60
                    ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
                    : `${remainingMin}m`;
                return (
                  <li key={w.id} className="text-amber-900/90 dark:text-amber-200/90">
                    <span className="font-medium">{w.name}</span>
                    {w.reason ? ` — ${w.reason}` : ""}
                    <span className="block text-xs text-amber-800/70 dark:text-amber-300/60">
                      {oneOff
                        ? `${startsAt.toLocaleString()} → ${endsAt.toLocaleString()} · ${remaining} remaining`
                        : `Recurring ${w.recurrence} · ${startsAt.toLocaleTimeString(
                            [],
                            timeFmt,
                          )}–${endsAt.toLocaleTimeString([], timeFmt)}`}
                    </span>
                  </li>
                );
              })}
          </ul>
          <p className="mt-2 pl-6 text-xs text-amber-800/70 dark:text-amber-300/60">
            During maintenance, incidents are still recorded but flagged
            <span className="font-medium"> suppressed</span> — no
            webhook/email/Telegram notifications are sent, and uptime % is not
            affected.
          </p>
        </div>
      )}

      {monitors.length === 0 && (
        <div className="card p-12 text-center">
          <div className="mx-auto w-12 h-12 grid place-items-center rounded-full bg-black/[0.05] dark:bg-white/[0.06] mb-3">
            <Plus className="w-6 h-6 text-[var(--color-brand-600)]" />
          </div>
          <p className="text-[var(--muted)]">No monitors yet.</p>
          <Link
            className="text-[var(--color-brand-600)] hover:underline font-medium"
            href="/monitors/new"
          >
            Create your first monitor
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ monitor, checks, uptime, disk, alerts }) => {
          const muted = globalMute || mutedMonitorIds.has(monitor.id);
          const status = monitor.lastStatus ?? "UNKNOWN";
          const level =
            status === "DOWN" || alerts.critical > 0
              ? "critical"
              : alerts.warning > 0
                ? "warning"
                : status === "UP"
                  ? "ok"
                  : "unknown";
          const accent =
            level === "ok"
              ? "before:bg-emerald-500"
              : level === "critical"
                ? "before:bg-red-500"
                : level === "warning"
                  ? "before:bg-amber-500"
                  : "before:bg-neutral-400";
          const dot =
            level === "ok"
              ? "bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.2)]"
              : level === "critical"
                ? "bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68/0.2)]"
                : level === "warning"
                  ? "bg-amber-500 shadow-[0_0_0_3px_rgb(245_158_11/0.2)]"
                  : "bg-neutral-400";
          const diskColor =
            disk && disk.usedPct !== null
              ? disk.usedPct > 90
                ? "bg-red-500"
                : disk.usedPct > 75
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              : "bg-neutral-300";
          return (
            <Link
              key={monitor.id}
              href={`/monitors/${monitor.id}`}
              className={`card card-hover relative overflow-hidden p-4 pl-5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${accent}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                    <span className="font-semibold truncate">{monitor.name}</span>
                    {alerts.critical > 0 && (
                      <span className="badge badge-down">
                        {alerts.critical} critical
                      </span>
                    )}
                    {alerts.warning > 0 && (
                      <span className="badge badge-warn">
                        {alerts.warning} warning
                      </span>
                    )}
                    {muted && <span className="badge badge-muted">maintenance</span>}
                    {!monitor.enabled && (
                      <span className="badge badge-muted">paused</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate mt-1 font-mono">
                    {monitor.url}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-semibold tabular-nums">
                    {uptime.pct === null ? "—" : `${uptime.pct.toFixed(1)}%`}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    24h uptime
                  </div>
                </div>
              </div>

              <div className="heartbeat-bar mt-4 flex gap-[3px] h-8 items-end">
                {Array.from({ length: 60 }).map((_, i) => {
                  const c = checks[checks.length - 1 - i];
                  const cls = !c
                    ? "bg-neutral-200/70 dark:bg-neutral-800"
                    : c.overallStatus === "UP"
                      ? "bg-emerald-500 hover:bg-emerald-400"
                      : c.overallStatus === "DOWN"
                        ? "bg-red-500 hover:bg-red-400"
                        : "bg-neutral-400";
                  return (
                    <div
                      key={i}
                      title={
                        c
                          ? `${c.overallStatus} · ${c.responseMs ?? "?"}ms · ${new Date(c.checkedAt).toLocaleString()}`
                          : "no data"
                      }
                      className={`flex-1 rounded-[2px] transition-colors ${cls}`}
                      style={{ height: c ? "100%" : "35%" }}
                    />
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                <span className="tabular-nums">
                  {checks[0]
                    ? `${checks[0].responseMs ?? "?"}ms · ${new Date(
                        checks[0].checkedAt,
                      ).toLocaleTimeString()}`
                    : "no checks yet"}
                </span>
                {disk && disk.usedPct !== null && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-16 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${diskColor}`}
                        style={{ width: `${Math.min(100, disk.usedPct)}%` }}
                      />
                    </span>
                    <span className="tabular-nums">{disk.usedPct.toFixed(0)}%</span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
