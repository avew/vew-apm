import { notFound } from "next/navigation";
import { formatDistanceToNowStrict, isToday, isYesterday, format } from "date-fns";
import {
  getPublicStatus,
  HISTORY_DAYS,
  type PublicState,
  type DaySeg,
  type PublicIncident,
} from "@/lib/status";

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

export default async function StatusPage() {
  const status = await getPublicStatus(new Date());
  if (!status.enabled) notFound();

  const banner = STATE_META[status.overall];
  const incidentRows = withHeaders(status.incidents);

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

      {status.services.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No services are currently published.
        </p>
      ) : (
        <ul className="space-y-4">
          {status.services.map((s) => {
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
                  <span>{HISTORY_DAYS} days ago</span>
                  <span>{pct(s.uptimePct)} uptime</span>
                  <span>Today</span>
                </div>
              </li>
            );
          })}
        </ul>
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
