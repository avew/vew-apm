import { getDb, schema } from "@/lib/db/client";
import { and, desc, eq, gte } from "drizzle-orm";
import { uptimePct } from "./uptime";
import type { StatusPage } from "@/lib/db/schema";

export type PublicState = "operational" | "degraded" | "down";

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
  label: string;
  severity: string;
  ongoing: boolean;
  count: number;
  // most recent occurrence in the group
  startedAt: Date;
}

export interface PublicService {
  id: number;
  name: string;
  state: PublicState;
  uptime: { day: number; week: number; month: number };
  incidents: PublicIncident[];
  // incidents beyond the shown top 10 (for a "+N more" hint)
  moreIncidents: number;
}

const MAX_INCIDENTS = 10;

/**
 * Collapse raw incidents into per-(label, ongoing) groups with a count, so the
 * public list doesn't repeat "Component issue" ten times. Ongoing first, then
 * most-recent; capped to the top MAX_INCIDENTS.
 */
export function groupIncidents(
  raw: { label: string; severity: string; ongoing: boolean; startedAt: Date }[],
): { shown: PublicIncident[]; more: number } {
  const groups = new Map<string, PublicIncident>();
  for (const i of raw) {
    const key = `${i.label}|${i.ongoing}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
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
  return {
    shown: sorted.slice(0, MAX_INCIDENTS),
    more: Math.max(0, sorted.length - MAX_INCIDENTS),
  };
}

export interface PublicStatus {
  enabled: boolean;
  title: string;
  overall: PublicState;
  services: PublicService[];
}

/** Everything the public /status page renders. Only opt-in, enabled monitors. */
export async function getPublicStatus(now: Date): Promise<PublicStatus> {
  const db = getDb();
  const settings = await loadStatusPageSettings();

  const monitors = await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      lastStatus: schema.monitors.lastStatus,
    })
    .from(schema.monitors)
    .where(and(eq(schema.monitors.public, true), eq(schema.monitors.enabled, true)))
    .orderBy(schema.monitors.name);

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const services = await Promise.all(
    monitors.map(async (m): Promise<PublicService> => {
      const [d, w, mth, open, recent] = await Promise.all([
        uptimePct(m.id, dayAgo),
        uptimePct(m.id, weekAgo),
        uptimePct(m.id, monthAgo),
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

      const { shown, more } = groupIncidents([
        ...open.map((i) => ({
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          startedAt: i.startedAt,
          ongoing: true,
        })),
        ...recent.map((i) => ({
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          startedAt: i.startedAt,
          ongoing: false,
        })),
      ]);

      return {
        id: m.id,
        name: m.name,
        state: deriveState(m.lastStatus, open),
        uptime: { day: d.upPct, week: w.upPct, month: mth.upPct },
        incidents: shown,
        moreIncidents: more,
      };
    }),
  );

  return {
    enabled: settings.enabled,
    title: settings.title,
    overall: overallState(services.map((s) => s.state)),
    services,
  };
}
