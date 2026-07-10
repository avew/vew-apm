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
  startedAt: Date;
  endedAt: Date | null;
  ongoing: boolean;
}

export interface PublicService {
  id: number;
  name: string;
  state: PublicState;
  uptime: { day: number; week: number; month: number };
  incidents: PublicIncident[];
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
            endedAt: schema.incidents.endedAt,
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
          .limit(5),
      ]);

      const incidents: PublicIncident[] = [
        ...open.map((i) => ({
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          startedAt: i.startedAt,
          endedAt: null,
          ongoing: true,
        })),
        ...recent.map((i) => ({
          label: publicIncidentLabel(i.kind),
          severity: i.severity,
          startedAt: i.startedAt,
          endedAt: i.endedAt,
          ongoing: false,
        })),
      ];

      return {
        id: m.id,
        name: m.name,
        state: deriveState(m.lastStatus, open),
        uptime: { day: d.upPct, week: w.upPct, month: mth.upPct },
        incidents,
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
