import { notFound } from "next/navigation";
import { formatDistanceToNowStrict, isToday, isYesterday, format } from "date-fns";
import {
  getPublicStatus,
  parseWindow,
  STATUS_WINDOWS,
  type PublicState,
  type DaySeg,
  type PublicIncident,
} from "@/lib/status";
import { groupByName } from "@/lib/grouping";
import { Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

const STATE_META: Record<
  PublicState,
  { dot: string; text: string; label: string; banner: string }
> = {
  operational: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Operational",
    banner: "All systems operational",
  },
  degraded: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    label: "Degraded",
    banner: "Some systems degraded",
  },
  down: {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    label: "Down",
    banner: "Active outage",
  },
};

const SEG_COLOR: Record<DaySeg, string> = {
  up: "bg-emerald-500",
  partial: "bg-amber-500",
  down: "bg-red-500",
  none: "bg-neutral-200 dark:bg-neutral-800",
};
const SEG_TITLE: Record<DaySeg, string> = {
  up: "Operational",
  partial: "Partial downtime",
  down: "Outage",
  none: "No data",
};

function pct(n: number) {
  return `${n.toFixed(n >= 99.995 ? 0 : 2)}%`;
}

function fmtDate(d: Date) {
  return format(d, "MMM d, HH:mm");
}

function UptimeBar({ history }: { history: DaySeg[] }) {
  return (
    <div className="mt-3 flex h-8 items-stretch gap-[2px]">
      {history.map((seg, i) => (
        <div
          key={i}
          title={`${SEG_TITLE[seg]} · ${history.length - 1 - i}d ago`}
          className={`flex-1 rounded-[2px] ${SEG_COLOR[seg]}`}
        />
      ))}
    </div>
  );
}

function incidentHeader(inc: PublicIncident): string {
  if (inc.ongoing) return "Ongoing";
  if (isToday(inc.startedAt)) return "Today";
  if (isYesterday(inc.startedAt)) return "Yesterday";
  return format(inc.startedAt, "MMM d");
}

// Precompute day/section headers so we don't mutate state during render.
function withHeaders(
  incidents: PublicIncident[],
): { inc: PublicIncident; header: string | null }[] {
  let prev = "";
  return incidents.map((inc) => {
    const h = incidentHeader(inc);
    const header = h !== prev ? h : null;
    prev = h;
    return { inc, header };
  });
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const win = parseWindow((await searchParams).window);
  const status = await getPublicStatus(new Date(), win);
  if (!status.enabled) notFound();

  const banner = STATE_META[status.overall];
  const incidentRows = withHeaders(status.incidents);
  const wcfg = STATUS_WINDOWS.find((w) => w.key === status.window)!;
  const serviceGroups = groupByName(status.services, (s) => s.group);
  const showGroupHeaders = serviceGroups.length > 1;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{status.title}</h1>
        <div
          className={`mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3 ${banner.text}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${banner.dot}`} />
          <span className="text-sm font-medium">{banner.banner}</span>
        </div>
      </header>

      {status.maintenance.length > 0 && (
        <section className="mb-6 space-y-2">
          {status.maintenance.map((mnt) => (
            <div
              key={mnt.id}
              className={`rounded-xl border px-4 py-3 ${
                mnt.active ? "border-amber-500/40" : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Wrench
                  className={`h-4 w-4 shrink-0 ${
                    mnt.active ? "text-amber-500" : "text-[var(--muted)]"
                  }`}
                />
                <span className="font-medium">
                  {mnt.active ? "Maintenance in progress" : "Scheduled maintenance"}
                </span>
                <span className="truncate text-[var(--muted)]">· {mnt.name}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {mnt.scope === "global" ? "All services" : mnt.serviceName}
                {" · "}
                {mnt.active
                  ? `until ${fmtDate(mnt.end)}`
                  : `${fmtDate(mnt.start)} → ${fmtDate(mnt.end)}`}
                {mnt.reason ? ` · ${mnt.reason}` : ""}
              </div>
            </div>
          ))}
        </section>
      )}

      {status.announcements.length > 0 && (
        <section className="mb-6 space-y-3">
          {status.announcements.map((a) => {
            const active = a.status !== "resolved";
            return (
              <div
                key={a.id}
                className={`rounded-xl border px-4 py-3 ${
                  active ? "border-amber-500/40" : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{a.title}</span>
                  <span
                    className={`text-xs font-medium ${
                      a.impact === "critical"
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {a.impact}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    {a.status}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5 border-l-2 border-[var(--border)] pl-3">
                  {a.updates.map((u) => (
                    <li key={u.id} className="text-xs">
                      <span className="font-medium capitalize">{u.status}</span>
                      <span className="text-[var(--muted)]"> · {fmtDate(u.createdAt)}</span>
                      <div className="text-[var(--muted)]">{u.body}</div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {status.services.length > 0 && (
        <div className="mb-4 flex items-center justify-end gap-1">
          <span className="mr-1 text-xs text-[var(--muted)]">Uptime window</span>
          {STATUS_WINDOWS.map((w) => {
            const active = w.key === status.window;
            return (
              <a
                key={w.key}
                href={`/status?window=${w.key}`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-black/[0.07] text-[var(--foreground)] dark:bg-white/[0.1]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {w.label}
              </a>
            );
          })}
        </div>
      )}

      {status.services.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No services are currently published.
        </p>
      ) : (
        <div className="space-y-6">
          {serviceGroups.map((grp) => (
            <section key={grp.name ?? "_ungrouped"}>
              {showGroupHeaders && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {grp.name ?? "Other"}
                </h2>
              )}
              <ul className="space-y-4">
                {grp.items.map((s) => {
                  const m = STATE_META[s.state];
                  return (
                    <li key={s.id} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
                    <span className="truncate font-medium">{s.name}</span>
                  </div>
                  <span className={`shrink-0 text-sm font-medium ${m.text}`}>
                    {m.label}
                  </span>
                </div>
                <UptimeBar history={s.history} />
                <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{wcfg.agoLabel}</span>
                  <span>{pct(s.uptimePct)} uptime</span>
                  <span>{status.window === "24h" ? "Now" : "Today"}</span>
                </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {status.incidents.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
            Past incidents
          </h2>
          <ul className="mt-3 space-y-1">
            {incidentRows.map(({ inc, header }, i) => {
              return (
                <li key={i}>
                  {header && (
                    <div className="mt-4 first:mt-0 mb-1.5 text-xs font-medium text-[var(--muted)]">
                      {header}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        inc.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                      }`}
                    />
                    <span className="font-medium">{inc.serviceName}</span>
                    <span className="text-[var(--muted)]">·</span>
                    <span>
                      {inc.label}
                      {inc.count > 1 && (
                        <span className="ml-1 text-[var(--muted)]">×{inc.count}</span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">
                      {inc.ongoing
                        ? `ongoing · ${formatDistanceToNowStrict(inc.startedAt)}`
                        : `${formatDistanceToNowStrict(inc.startedAt)} ago`}
                    </span>
                  </div>
                </li>
              );
            })}
            {status.moreIncidents > 0 && (
              <li className="pt-2 text-xs text-[var(--muted)]">
                +{status.moreIncidents} more
              </li>
            )}
          </ul>
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        Powered by Vew APM
      </footer>
    </main>
  );
}
