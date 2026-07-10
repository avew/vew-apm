import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import type { Monitor, AlertSettings } from "@/lib/db/schema";

export interface EffectiveThresholds {
  diskWarnPct: number;
  diskCritPct: number;
  downForMinutes: number;
  latencyWarnMs: number;
  latencyWindow: number;
  eurekaDropAlert: boolean;
  serviceGraceSeconds: number;
  componentGraceSeconds: number;
}

export const ALERT_DEFAULTS: EffectiveThresholds = {
  diskWarnPct: 60,
  diskCritPct: 85,
  downForMinutes: 3,
  latencyWarnMs: 2000,
  latencyWindow: 5,
  eurekaDropAlert: true,
  serviceGraceSeconds: 30,
  componentGraceSeconds: 60,
};

export async function loadAlertSettings(): Promise<AlertSettings> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.alertSettings)
    .where(eq(schema.alertSettings.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(schema.alertSettings)
    .values({ id: 1, ...ALERT_DEFAULTS })
    .returning();
  return created;
}

export async function updateAlertSettings(
  patch: Partial<EffectiveThresholds> & { retentionDays?: number },
): Promise<void> {
  const db = getDb();
  await loadAlertSettings(); // ensure row exists
  await db
    .update(schema.alertSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.alertSettings.id, 1));
}

/** Merge global defaults with per-monitor overrides (override null → inherit). */
export function mergeThresholds(
  global: EffectiveThresholds,
  monitor: Monitor,
): EffectiveThresholds {
  return {
    diskWarnPct: monitor.diskWarnPct ?? global.diskWarnPct,
    diskCritPct: monitor.diskCritPct ?? global.diskCritPct,
    downForMinutes: monitor.downForMinutes ?? global.downForMinutes,
    latencyWarnMs: monitor.latencyWarnMs ?? global.latencyWarnMs,
    latencyWindow: monitor.latencyWindow ?? global.latencyWindow,
    eurekaDropAlert: monitor.eurekaDropAlert ?? global.eurekaDropAlert,
    serviceGraceSeconds:
      monitor.serviceGraceSeconds ?? global.serviceGraceSeconds,
    componentGraceSeconds:
      monitor.componentGraceSeconds ?? global.componentGraceSeconds,
  };
}

export async function getEffectiveThresholds(
  monitor: Monitor,
): Promise<EffectiveThresholds> {
  const row = await loadAlertSettings();
  const global: EffectiveThresholds = {
    diskWarnPct: row.diskWarnPct,
    diskCritPct: row.diskCritPct,
    downForMinutes: row.downForMinutes,
    latencyWarnMs: row.latencyWarnMs,
    latencyWindow: row.latencyWindow,
    eurekaDropAlert: row.eurekaDropAlert,
    serviceGraceSeconds: row.serviceGraceSeconds,
    componentGraceSeconds: row.componentGraceSeconds,
  };
  return mergeThresholds(global, monitor);
}
