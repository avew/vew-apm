import { getDb, schema } from "@/lib/db/client";
import { and, eq, lt } from "drizzle-orm";
import { loadAlertSettings } from "./alerts";

function changesOf(res: unknown): number {
  return (res as { changes?: number }).changes ?? 0;
}

/**
 * Delete checks older than `retentionDays` (0 = keep forever). Child rows
 * (component_statuses, disk_snapshots, service_snapshots) cascade via FK.
 * Returns the number of check rows removed.
 */
export async function pruneOldChecks(retentionDays: number): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0;
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const res = await db
    .delete(schema.checks)
    .where(lt(schema.checks.checkedAt, cutoff));
  return changesOf(res);
}

/**
 * Delete RESOLVED incidents ended before the cutoff. Incidents key off
 * monitorId (not checkId) so they don't cascade with checks — without this they
 * grow unbounded. Open/ongoing incidents are always kept regardless of age.
 */
export async function pruneOldIncidents(retentionDays: number): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0;
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const res = await db
    .delete(schema.incidents)
    .where(
      and(
        eq(schema.incidents.resolved, true),
        lt(schema.incidents.endedAt, cutoff),
      ),
    );
  return changesOf(res);
}

export async function pruneUsingSettings(): Promise<number> {
  const settings = await loadAlertSettings();
  const checks = await pruneOldChecks(settings.retentionDays);
  const incidents = await pruneOldIncidents(settings.retentionDays);
  if (incidents > 0) {
    console.log(`[retention] pruned ${incidents} resolved incident(s)`);
  }
  return checks;
}
