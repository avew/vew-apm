import { getDb, schema } from "@/lib/db/client";
import { and, eq, or } from "drizzle-orm";
import { RRule } from "rrule";
import type { MaintenanceWindow } from "@/lib/db/schema";

function occursAt(w: MaintenanceWindow, at: Date): boolean {
  if (w.recurrence === "none") {
    return at >= w.startsAt && at <= w.endsAt;
  }
  const durationMs = w.endsAt.getTime() - w.startsAt.getTime();
  const freqMap: Record<string, number> = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
  };
  const freq = freqMap[w.recurrence];
  if (freq === undefined) return false;
  const rule = new RRule({
    freq,
    dtstart: w.startsAt,
    until: new Date(at.getTime() + durationMs),
  });
  const before = rule.before(at, true);
  if (!before) return false;
  const occEnd = new Date(before.getTime() + durationMs);
  return at >= before && at <= occEnd;
}

export async function isMonitorMuted(
  monitorId: number,
  at: Date = new Date(),
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.maintenanceWindows)
    .where(
      or(
        eq(schema.maintenanceWindows.scope, "global"),
        and(
          eq(schema.maintenanceWindows.scope, "monitor"),
          eq(schema.maintenanceWindows.monitorId, monitorId),
        ),
      ),
    );
  for (const w of rows) {
    if (occursAt(w, at)) return true;
  }
  return false;
}

export async function listActiveWindows(
  at: Date = new Date(),
): Promise<MaintenanceWindow[]> {
  const db = getDb();
  const rows = await db.select().from(schema.maintenanceWindows);
  return rows.filter((w) => occursAt(w, at));
}

export { occursAt };
