import { getDb, schema } from "@/lib/db/client";
import { and, eq, gte, sql } from "drizzle-orm";

export async function uptimePct(
  monitorId: number,
  since: Date,
): Promise<{ upPct: number; total: number; up: number }> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`.as("total"),
      up: sql<number>`COUNT(*) FILTER (WHERE ${schema.checks.overallStatus} = 'UP')`.as(
        "up",
      ),
    })
    .from(schema.checks)
    .where(
      and(
        eq(schema.checks.monitorId, monitorId),
        gte(schema.checks.checkedAt, since),
      ),
    );
  const r = rows[0] ?? { total: 0, up: 0 };
  const upPct = r.total > 0 ? (r.up / r.total) * 100 : 0;
  return { upPct, total: r.total, up: r.up };
}
