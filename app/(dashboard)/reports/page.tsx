import { loadSloReport, parseSloPeriod, SLO_PERIODS } from "@/lib/slo";

export const dynamic = "force-dynamic";

function budgetLabel(used: number, hasData: boolean): string {
  if (!hasData) return "—";
  if (used === Infinity) return "no budget";
  return `${Math.round(used)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = parseSloPeriod((await searchParams).period);
  const { rows } = await loadSloReport(period, new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SLO report</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Uptime vs target and error budget. Maintenance windows are excluded.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {SLO_PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <a
                key={p.key}
                href={`/reports?period=${p.key}`}
                className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                  active
                    ? "bg-black/[0.06] text-[var(--foreground)] dark:bg-white/[0.08]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {p.key}
              </a>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-[var(--muted)]">No monitors yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium tabular-nums">Uptime</th>
                <th className="px-4 py-3 font-medium tabular-nums">Target</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium tabular-nums">Budget used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, name, group, slo }) => (
                <tr key={id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{name}</span>
                    {group && (
                      <span className="ml-2 text-xs text-[var(--muted)]">{group}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {slo.hasData ? `${slo.uptimePct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {slo.target}%
                  </td>
                  <td className="px-4 py-3">
                    {!slo.hasData ? (
                      <span className="badge badge-muted">no data</span>
                    ) : slo.met ? (
                      <span className="badge badge-up">met</span>
                    ) : (
                      <span className="badge badge-down">breached</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                        <span
                          className={`block h-full rounded-full ${
                            slo.budgetUsedPct >= 100 ? "bg-red-500" : "bg-emerald-500"
                          }`}
                          style={{
                            width: `${Math.min(100, slo.hasData && slo.budgetUsedPct !== Infinity ? slo.budgetUsedPct : slo.hasData ? 100 : 0)}%`,
                          }}
                        />
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {budgetLabel(slo.budgetUsedPct, slo.hasData)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
