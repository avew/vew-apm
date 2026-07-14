import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { uptimePct } from "./uptime";
import { loadAlertSettings } from "./alerts";

export type SloPeriod = "7d" | "30d" | "90d";

export const SLO_PERIODS: { key: SloPeriod; label: string; days: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
];

export function parseSloPeriod(p: string | undefined): SloPeriod {
  return p === "7d" || p === "30d" || p === "90d" ? p : "30d";
}

export interface SloResult {
  /** measured uptime % over the period (0 when there are no checks) */
  uptimePct: number;
  target: number;
  met: boolean;
  hasData: boolean;
  /** downtime budget allowed by the target, in minutes */
  allowedDownMin: number;
  /** observed downtime over the period, in minutes */
  observedDownMin: number;
  /** % of the error budget consumed (>100 = breached; 0 when target is 100%) */
  budgetUsedPct: number;
}

/**
 * SLO math for one monitor. `total`/`up` are check counts (downtime is
 * approximated as the down-fraction of the period — good enough for a
 * self-hosted view). `budgetUsedPct` caps display at ∞ when the target is 100%.
 */
export function computeSlo(
  total: number,
  up: number,
  target: number,
  periodDays: number,
): SloResult {
  const hasData = total > 0;
  const uptimePctVal = hasData ? (up / total) * 100 : 0;
  const downFraction = hasData ? (total - up) / total : 0;
  const periodMin = periodDays * 24 * 60;
  const allowedDownMin = ((100 - target) / 100) * periodMin;
  const observedDownMin = downFraction * periodMin;
  const budgetUsedPct =
    allowedDownMin > 0
      ? (observedDownMin / allowedDownMin) * 100
      : observedDownMin > 0
        ? Infinity
        : 0;
  return {
    uptimePct: uptimePctVal,
    target,
    met: hasData ? uptimePctVal >= target : true,
    hasData,
    allowedDownMin,
    observedDownMin,
    budgetUsedPct,
  };
}

export interface SloRow {
  id: number;
  name: string;
  group: string | null;
  slo: SloResult;
}

export async function loadSloReport(
  period: SloPeriod,
  now: Date,
): Promise<{ target: number; rows: SloRow[] }> {
  const db = getDb();
  const settings = await loadAlertSettings();
  const cfg = SLO_PERIODS.find((p) => p.key === period) ?? SLO_PERIODS[1];
  const since = new Date(now.getTime() - cfg.days * 86_400_000);

  const monitors = await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      group: schema.monitors.group,
      sloTarget: schema.monitors.sloTarget,
    })
    .from(schema.monitors)
    .orderBy(desc(schema.monitors.createdAt));

  const rows = await Promise.all(
    monitors.map(async (m): Promise<SloRow> => {
      const { total, up } = await uptimePct(m.id, since);
      const target = m.sloTarget ?? settings.sloTarget;
      return {
        id: m.id,
        name: m.name,
        group: m.group,
        slo: computeSlo(total, up, target, cfg.days),
      };
    }),
  );

  return { target: settings.sloTarget, rows };
}
