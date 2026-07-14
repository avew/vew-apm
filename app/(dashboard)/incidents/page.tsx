import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { eq, desc, and } from "drizzle-orm";
import { AutoRefresh } from "../auto-refresh";
import { getT } from "@/lib/i18n-server";
import { Siren } from "lucide-react";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  availability: "Availability",
  disk: "Disk usage",
  latency: "Latency",
  component_down: "Component down",
  eureka: "Eureka",
  service_missing: "Service missing",
  cert_expiry: "TLS certificate",
  down: "Down",
};

type Filter = "open" | "resolved" | "all";

async function loadIncidents(filter: Filter) {
  const db = getDb();
  const where =
    filter === "all"
      ? undefined
      : eq(schema.incidents.resolved, filter === "resolved");
  const rows = await db
    .select({
      id: schema.incidents.id,
      monitorId: schema.incidents.monitorId,
      monitorName: schema.monitors.name,
      componentPath: schema.incidents.componentPath,
      kind: schema.incidents.kind,
      severity: schema.incidents.severity,
      reason: schema.incidents.reason,
      startedAt: schema.incidents.startedAt,
      endedAt: schema.incidents.endedAt,
      resolved: schema.incidents.resolved,
      suppressed: schema.incidents.suppressed,
    })
    .from(schema.incidents)
    .innerJoin(schema.monitors, eq(schema.incidents.monitorId, schema.monitors.id))
    .where(where)
    .orderBy(desc(schema.incidents.startedAt))
    .limit(200);

  return rows.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.startedAt.getTime() - a.startedAt.getTime();
  });
}

async function counts() {
  const db = getDb();
  const open = await db
    .select({ id: schema.incidents.id, severity: schema.incidents.severity })
    .from(schema.incidents)
    .where(eq(schema.incidents.resolved, false));
  return {
    open: open.length,
    critical: open.filter((r) => r.severity === "critical").length,
    warning: open.filter((r) => r.severity === "warning").length,
  };
}

function fmtDuration(start: Date, end: Date | null) {
  const ms = (end ?? new Date()).getTime() - start.getTime();
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: raw } = await searchParams;
  const filter: Filter =
    raw === "resolved" || raw === "all" ? raw : "open";
  const [incidents, c, t] = await Promise.all([
    loadIncidents(filter),
    counts(),
    getT(),
  ]);

  const TABS: { key: Filter; label: string }[] = [
    { key: "open", label: t("ongoing") },
    { key: "resolved", label: t("resolved") },
    { key: "all", label: t("all") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Siren className="w-6 h-6" /> {t("titleIncidents")}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {c.open === 0 ? (
              t("allClear")
            ) : (
              <>
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {c.critical} {t("critical")}
                </span>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {c.warning} {t("warning")}
                </span>
                {" " + t("ongoing").toLowerCase()}
              </>
            )}
          </p>
        </div>
        <AutoRefresh />
      </div>

      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "open" ? "/incidents" : `/incidents?filter=${t.key}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === t.key
                ? "bg-black/[0.06] text-[var(--foreground)] dark:bg-white/[0.08]"
                : "text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {incidents.length === 0 ? (
          <div className="p-10 text-center text-[var(--muted)]">
            No incidents{filter === "open" ? " ongoing" : ""}.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {incidents.map((i) => {
              const sevBadge =
                i.severity === "warning" ? "badge-warn" : "badge-down";
              const dot = i.resolved
                ? "bg-emerald-500"
                : i.severity === "warning"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500 animate-pulse";
              return (
                <li
                  key={i.id}
                  className="flex items-start justify-between gap-3 p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className={`badge ${sevBadge}`}>{i.severity}</span>
                      <span className="text-sm font-medium">
                        {KIND_LABEL[i.kind] ?? i.kind}
                      </span>
                      <Link
                        href={`/monitors/${i.monitorId}`}
                        className="text-sm text-[var(--color-brand-600)] hover:underline"
                      >
                        {i.monitorName}
                      </Link>
                      <span className="font-mono text-xs text-[var(--muted)]">
                        {i.componentPath ?? "overall"}
                      </span>
                      {i.suppressed && (
                        <span className="badge badge-muted">suppressed</span>
                      )}
                      {!i.resolved && (
                        <span className="badge badge-down">ongoing</span>
                      )}
                    </div>
                    {i.reason && (
                      <div className="text-xs text-[var(--muted)] mt-1 ml-4">
                        {i.reason}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] text-right shrink-0 tabular-nums">
                    <div>{new Date(i.startedAt).toLocaleString()}</div>
                    <div className="mt-0.5">
                      {i.resolved ? "lasted" : "for"}{" "}
                      {fmtDuration(i.startedAt, i.endedAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
