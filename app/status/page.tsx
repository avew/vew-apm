import { notFound } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { getPublicStatus, type PublicState } from "@/lib/status";

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

function pct(n: number) {
  return `${n.toFixed(n >= 99.995 ? 0 : 2)}%`;
}

export default async function StatusPage() {
  const status = await getPublicStatus(new Date());
  if (!status.enabled) notFound();

  const banner = STATE_META[status.overall];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
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
        <ul className="space-y-3">
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

                <div className="mt-2 flex gap-4 text-xs text-[var(--muted)]">
                  <span>24h {pct(s.uptime.day)}</span>
                  <span>7d {pct(s.uptime.week)}</span>
                  <span>30d {pct(s.uptime.month)}</span>
                </div>

                {s.incidents.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                    {s.incidents.map((inc, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            inc.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                          }`}
                        />
                        <span className="font-medium">{inc.label}</span>
                        <span className="text-[var(--muted)]">
                          {inc.ongoing
                            ? `ongoing · started ${formatDistanceToNowStrict(inc.startedAt)} ago`
                            : `resolved · ${formatDistanceToNowStrict(inc.startedAt)} ago`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        Powered by Vew APM
      </footer>
    </main>
  );
}
