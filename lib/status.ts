import { getDb, schema } from "@/lib/db/client";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { uptimePct } from "./uptime";
import { currentOccurrence, nextOccurrence } from "./maintenance";
import { loadPublicStatusIncidents, type IncidentWithUpdates } from "./status-incidents";
import type { StatusPage } from "@/lib/db/schema";

export type PublicState = "operational" | "degraded" | "down";
export type DaySeg = "up" | "partial" | "down" | "none";

export type StatusWindow = "24h" | "7d" | "90d";

export const STATUS_WINDOWS: {
  key: StatusWindow;
  label: string;
  buckets: number;
  bucketMs: number;
  agoLabel: string;
}[] = [
  { key: "24h", label: "24h", buckets: 24, bucketMs: 3_600_000, agoLabel: "24 hours ago" },
  { key: "7d", label: "7d", buckets: 7, bucketMs: 86_400_000, agoLabel: "7 days ago" },
  { key: "90d", label: "90d", buckets: 90, bucketMs: 86_400_000, agoLabel: "90 days ago" },
];

export function parseWindow(w: string | undefined): StatusWindow {
  return w === "24h" || w === "7d" || w === "90d" ? w : "90d";
}

function windowConfig(w: StatusWindow) {
  return STATUS_WINDOWS.find((x) => x.key === w) ?? STATUS_WINDOWS[2];
}

// Generic, infra-agnostic labels — the public page must not leak component
// paths, service names, disk paths, or raw incident reasons.
const INCIDENT_LABELS: Record<string, string> = {
  availability: "Service unavailable",
  component_down: "Component issue",
  disk: "Storage pressure",
  latency: "Elevated latency",
  eureka: "Registry issue",
  service_missing: "Dependency missing",
  down: "Service issue",
};

export function publicIncidentLabel(kind: string): string {
  return INCIDENT_LABELS[kind] ?? "Service issue";
}

/** Worst-of: an open critical (or a DOWN last check) = down; open warning = degraded. */
export function deriveState(
  lastStatus: string | null,
  openIncidents: { severity: string }[],
): PublicState {
  if (openIncidents.some((i) => i.severity === "critical") || lastStatus === "DOWN") {
    return "down";
  }
  if (openIncidents.some((i) => i.severity === "warning")) return "degraded";
  return "operational";
}

export function overallState(states: PublicState[]): PublicState {
  if (states.some((s) => s === "down")) return "down";
  if (states.some((s) => s === "degraded")) return "degraded";
  return "operational";
}

/** Color a day's bar from its up-ratio. No checks that day → "none" (gray). */
export function segState(total: number, up: number): DaySeg {
  if (total === 0) return "none";
  const r = up / total;
  if (r >= 0.99) return "up";
  if (r >= 0.9) return "partial";
  return "down";
}

export async function loadStatusPageSettings(): Promise<StatusPage> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.statusPage)
    .where(eq(schema.statusPage.id, 1));
  if (row) return row;
  const [created] = await db
    .insert(schema.statusPage)
    .values({ id: 1 })
    .returning();
  return created;
}

export async function updateStatusPageSettings(patch: {
  enabled?: boolean;
  title?: string;
}): Promise<void> {
  const db = getDb();
  await loadStatusPageSettings();
  await db
    .update(schema.statusPage)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.statusPage.id, 1));
}

export interface PublicIncident {
  serviceName?: string;
  label: string;
  severity: string;
  ongoing: boolean;
  count: number;
  // most recent occurrence in the group
  startedAt: Date;
}

/**
 * Collapse raw incidents by (service, label, ongoing) into one row with a count
 * so the feed doesn't repeat "Component issue" ten times. Ongoing first, then
 * most-recent; capped to `max` groups with the remainder returned as `more`.
 */
export function groupIncidents(
  raw: {
    serviceName?: string;
    label: string;
    severity: string;
    ongoing: boolean;
    startedAt: Date;
  }[],
  max = 10,
): { shown: PublicIncident[]; more: number } {
  const groups = new Map<string, PublicIncident>();
  for (const i of raw) {
    const key = `${i.serviceName ?? ""}|${i.label}|${i.ongoing}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        serviceName: i.serviceName,
        label: i.label,
        severity: i.severity,
        ongoing: i.ongoing,
        count: 1,
        startedAt: i.startedAt,
      });
    } else {
      g.count++;
      if (i.startedAt > g.startedAt) g.startedAt = i.startedAt;
      if (i.severity === "critical") g.severity = "critical";
    }
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.ongoing === b.ongoing
      ? b.startedAt.getTime() - a.startedAt.getTime()
      : a.ongoing
        ? -1
        : 1,
  );
  return { shown: sorted.slice(0, max), more: Math.max(0, sorted.length - max) };
}

export interface PublicService {
  id: number;
  name: string;
  group: string | null;
  state: PublicState;
  uptimePct: number;
  history: DaySeg[];
}

export interface PublicMaintenance {
  id: number;
  name: string;
  reason: string | null;
  scope: string; // "global" | "monitor"
  serviceName: string | null;
  start: Date;
  end: Date;
  active: boolean; // true = in progress now, false = upcoming
}

export interface PublicStatus {
  enabled: boolean;
  title: string;
  overall: PublicState;
  window: StatusWindow;
  services: PublicService[];
  incidents: PublicIncident[];
  moreIncidents: number;
  maintenance: PublicMaintenance[];
  announcements: IncidentWithUpdates[];
}

const UPCOMING_WINDOW_MS = 7 * 86_400_000;

/**
 * Up/partial/down history for the window (oldest→newest). 24h buckets by hour,
 * 7d/90d by day. Buckets with no checks render "none" (gray).
 */
async function history(
  monitorId: number,
  now: Date,
  win: StatusWindow,
): Promise<DaySeg[]> {
  const db = getDb();
  const cfg = windowConfig(win);
  const hourly = win === "24h";
  const since = new Date(now.getTime() - cfg.buckets * cfg.bucketMs);
  const bucketExpr = hourly
    ? sql<string>`strftime('%Y-%m-%dT%H', ${schema.checks.checkedAt}, 'unixepoch')`
    : sql<string>`strftime('%Y-%m-%d', ${schema.checks.checkedAt}, 'unixepoch')`;

  const rows = await db
    .select({
      bucket: bucketExpr.as("bucket"),
      total: sql<number>`count(*)`.as("total"),
      up: sql<number>`sum(case when ${schema.checks.overallStatus} = 'UP' then 1 else 0 end)`.as("up"),
    })
    .from(schema.checks)
    .where(
      and(
        eq(schema.checks.monitorId, monitorId),
        eq(schema.checks.muted, false),
        gte(schema.checks.checkedAt, since),
      ),
    )
    .groupBy(bucketExpr);

  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  const out: DaySeg[] = [];
  for (let i = cfg.buckets - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * cfg.bucketMs);
    const key = hourly
      ? d.toISOString().slice(0, 13)
      : d.toISOString().slice(0, 10);
    const r = byBucket.get(key);
    out.push(r ? segState(r.total, r.up) : "none");
  }
  return out;
}

/** Everything the public /status page renders. Only opt-in, enabled monitors. */
export async function getPublicStatus(
  now: Date,
  win: StatusWindow = "90d",
): Promise<PublicStatus> {
  const db = getDb();
  const settings = await loadStatusPageSettings();

  const monitors = await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      group: schema.monitors.group,
      lastStatus: schema.monitors.lastStatus,
    })
    .from(schema.monitors)
    .where(and(eq(schema.monitors.public, true), eq(schema.monitors.enabled, true)))
    .orderBy(schema.monitors.name);

  const cfg = windowConfig(win);
  const uptimeStart = new Date(now.getTime() - cfg.buckets * cfg.bucketMs);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const rawIncidents: {
    serviceName: string;
    label: string;
    severity: string;
    ongoing: boolean;
    startedAt: Date;
  }[] = [];

  const services = await Promise.all(
    monitors.map(async (m): Promise<PublicService> => {
      const [up, hist, open, recent] = await Promise.all([
        uptimePct(m.id, uptimeStart),
        history(m.id, now, win),
        db
          .select({
            kind: schema.incidents.kind,
            severity: schema.incidents.severity,
            startedAt: schema.incidents.startedAt,
          })
          .from(schema.incidents)
          .where(
            and(
              eq(schema.incidents.monitorId, m.id),
              eq(schema.incidents.resolved, false),
              eq(schema.incidents.suppressed, false),
            ),
          ),
        db
          .select({
            kind: schema.incidents.kind,
            severity: schema.incidents.severity,
            startedAt: schema.incidents.startedAt,
          })
          .from(schema.incidents)
          .where(
            and(
              eq(schema.incidents.monitorId, m.id),
              eq(schema.incidents.resolved, true),
              eq(schema.incidents.suppressed, false),
              gte(schema.incidents.startedAt, weekAgo),
            ),
          )
          .orderBy(desc(schema.incidents.startedAt))
          .limit(50),
      ]);

      for (const i of open) {
        rawIncidents.push({
          serviceName: m.name,
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          ongoing: true,
          startedAt: i.startedAt,
        });
      }
      for (const i of recent) {
        rawIncidents.push({
          serviceName: m.name,
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          ongoing: false,
          startedAt: i.startedAt,
        });
      }

      return {
        id: m.id,
        name: m.name,
        group: m.group,
        state: deriveState(m.lastStatus, open),
        uptimePct: up.upPct,
        history: hist,
      };
    }),
  );

  const { shown, more } = groupIncidents(rawIncidents, 20);

  // Public-safe maintenance: global windows + monitor-scoped ones whose monitor
  // is public (never leak a private monitor's existence). Active now, or
  // upcoming within the next 7 days.
  const publicIds = new Set(monitors.map((m) => m.id));
  const nameById = new Map(monitors.map((m) => [m.id, m.name]));
  const windows = await db.select().from(schema.maintenanceWindows);
  const maintenance: PublicMaintenance[] = [];
  for (const w of windows) {
    if (w.scope === "monitor" && (!w.monitorId || !publicIds.has(w.monitorId))) {
      continue;
    }
    const serviceName =
      w.scope === "monitor" && w.monitorId ? nameById.get(w.monitorId) ?? null : null;
    const base = {
      id: w.id,
      name: w.name,
      reason: w.reason,
      scope: w.scope,
      serviceName,
    };
    const cur = currentOccurrence(w, now);
    if (cur) {
      maintenance.push({ ...base, start: cur.start, end: cur.end, active: true });
      continue;
    }
    const next = nextOccurrence(w, now);
    if (next && next.start.getTime() <= now.getTime() + UPCOMING_WINDOW_MS) {
      maintenance.push({ ...base, start: next.start, end: next.end, active: false });
    }
  }
  maintenance.sort((a, b) =>
    a.active === b.active
      ? a.start.getTime() - b.start.getTime()
      : a.active
        ? -1
        : 1,
  );

  const announcements = await loadPublicStatusIncidents(now);

  return {
    enabled: settings.enabled,
    title: settings.title,
    overall: overallState(services.map((s) => s.state)),
    window: win,
    services,
    incidents: shown,
    moreIncidents: more,
    maintenance,
    announcements,
  };
}
