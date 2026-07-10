import { getDb, schema } from "@/lib/db/client";
import { lt } from "drizzle-orm";
import { loadAlertSettings } from "./alerts";

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
  return (res as unknown as { changes?: number }).changes ?? 0;
}

export async function pruneUsingSettings(): Promise<number> {
  const settings = await loadAlertSettings();
  return pruneOldChecks(settings.retentionDays);
}
