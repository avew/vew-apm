import { getDb, schema } from "@/lib/db/client";
import { and, eq, or } from "drizzle-orm";
import { RRule } from "rrule";
import type { MaintenanceWindow } from "@/lib/db/schema";

export interface Occurrence {
  start: Date;
  end: Date;
}

const FREQ: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};

function durationMs(w: MaintenanceWindow): number {
  return w.endsAt.getTime() - w.startsAt.getTime();
}

function ruleFor(w: MaintenanceWindow): RRule | null {
  const freq = FREQ[w.recurrence];
  if (freq === undefined) return null;
  return new RRule({ freq, dtstart: w.startsAt });
}

/** The occurrence covering `at`, or null if the window isn't active then. */
export function currentOccurrence(
  w: MaintenanceWindow,
  at: Date,
): Occurrence | null {
  if (w.recurrence === "none") {
    return at >= w.startsAt && at <= w.endsAt
      ? { start: w.startsAt, end: w.endsAt }
      : null;
  }
  const rule = ruleFor(w);
  if (!rule) return null;
  const start = rule.before(at, true);
  if (!start) return null;
  const end = new Date(start.getTime() + durationMs(w));
  return at >= start && at <= end ? { start, end } : null;
}

/** The next occurrence starting strictly after `at`, or null. */
export function nextOccurrence(
  w: MaintenanceWindow,
  at: Date,
): Occurrence | null {
  if (w.recurrence === "none") {
    return w.startsAt > at ? { start: w.startsAt, end: w.endsAt } : null;
  }
  const rule = ruleFor(w);
  if (!rule) return null;
  const start = rule.after(at, false);
  if (!start) return null;
  return { start, end: new Date(start.getTime() + durationMs(w)) };
}

export function occursAt(w: MaintenanceWindow, at: Date): boolean {
  return currentOccurrence(w, at) !== null;
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
