import { getDb, schema } from "@/lib/db/client";
import { desc, eq, inArray } from "drizzle-orm";
import type { StatusIncident, StatusIncidentUpdate } from "@/lib/db/schema";
import type {
  IncidentStatus,
  IncidentImpact,
  IncidentWithUpdates,
} from "./status-incident-constants";

export {
  INCIDENT_STATUSES,
  INCIDENT_IMPACTS,
  isIncidentStatus,
  isIncidentImpact,
  type IncidentStatus,
  type IncidentImpact,
  type IncidentWithUpdates,
} from "./status-incident-constants";

/** Create an incident with its first update (transactional). Returns the id. */
export function createStatusIncident(input: {
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  body: string;
}): number {
  const db = getDb();
  const now = new Date();
  return db.transaction((tx) => {
    const [inc] = tx
      .insert(schema.statusIncidents)
      .values({
        title: input.title,
        impact: input.impact,
        status: input.status,
        startedAt: now,
        resolvedAt: input.status === "resolved" ? now : null,
        updatedAt: now,
      })
      .returning({ id: schema.statusIncidents.id })
      .all();
    tx.insert(schema.statusIncidentUpdates)
      .values({ incidentId: inc.id, status: input.status, body: input.body })
      .run();
    return inc.id;
  });
}

/** Append an update; advances the incident's status (+ resolvedAt). */
export function addStatusIncidentUpdate(
  incidentId: number,
  input: { status: IncidentStatus; body: string },
): void {
  const db = getDb();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(schema.statusIncidentUpdates)
      .values({ incidentId, status: input.status, body: input.body })
      .run();
    tx.update(schema.statusIncidents)
      .set({
        status: input.status,
        resolvedAt: input.status === "resolved" ? now : null,
        updatedAt: now,
      })
      .where(eq(schema.statusIncidents.id, incidentId))
      .run();
  });
}

export async function deleteStatusIncident(id: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.statusIncidents).where(eq(schema.statusIncidents.id, id));
}

/** Attach each incident's updates (newest first). */
async function withUpdates(
  incidents: StatusIncident[],
): Promise<IncidentWithUpdates[]> {
  if (incidents.length === 0) return [];
  const db = getDb();
  const ids = incidents.map((i) => i.id);
  const updates = await db
    .select()
    .from(schema.statusIncidentUpdates)
    .where(inArray(schema.statusIncidentUpdates.incidentId, ids))
    .orderBy(desc(schema.statusIncidentUpdates.id));
  const byId = new Map<number, StatusIncidentUpdate[]>();
  for (const u of updates) {
    const arr = byId.get(u.incidentId);
    if (arr) arr.push(u);
    else byId.set(u.incidentId, [u]);
  }
  return incidents.map((i) => ({ ...i, updates: byId.get(i.id) ?? [] }));
}

/** All incidents, newest first — for the admin view. */
export async function listStatusIncidents(): Promise<IncidentWithUpdates[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.statusIncidents)
    .orderBy(desc(schema.statusIncidents.startedAt));
  return withUpdates(rows);
}

/** Active incidents + those resolved within the last 7 days — for /status. */
export async function loadPublicStatusIncidents(
  now: Date,
): Promise<IncidentWithUpdates[]> {
  const db = getDb();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db
    .select()
    .from(schema.statusIncidents)
    .orderBy(desc(schema.statusIncidents.startedAt));
  const relevant = rows.filter(
    (i) =>
      i.status !== "resolved" ||
      (i.resolvedAt != null && i.resolvedAt >= weekAgo),
  );
  // Active (unresolved) first, then newest.
  relevant.sort((a, b) => {
    const ar = a.status === "resolved" ? 1 : 0;
    const br = b.status === "resolved" ? 1 : 0;
    return ar !== br ? ar - br : b.startedAt.getTime() - a.startedAt.getTime();
  });
  return withUpdates(relevant);
}
