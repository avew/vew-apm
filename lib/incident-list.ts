import { getDb, schema } from "@/lib/db/client";
import { and, eq, or, like, sql, desc } from "drizzle-orm";

export interface ClientIncident {
  id: number;
  kind: string;
  severity: string;
  componentPath: string | null;
  reason: string | null;
  resolved: boolean;
  suppressed: boolean;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
}

export interface IncidentListResult {
  incidents: ClientIncident[];
  total: number;
  page: number;
  pageSize: number;
}

export const INCIDENT_PAGE_SIZE = 20;

/**
 * Paginated, searchable incident list for one monitor. Shared by the detail
 * page (first page, server-rendered) and the /incidents API (search + paging).
 * Search matches kind / componentPath / reason (case-insensitive substring).
 * Order matches the detail card: ongoing first, then critical before warning,
 * then most recent — applied in SQL so limit/offset paginate correctly.
 */
export async function loadMonitorIncidents(opts: {
  monitorId: number;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<IncidentListResult> {
  const db = getDb();
  const page = Math.max(1, Math.trunc(opts.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(opts.pageSize ?? INCIDENT_PAGE_SIZE)));
  const q = (opts.q ?? "").trim();

  const filters = [eq(schema.incidents.monitorId, opts.monitorId)];
  if (q) {
    const pat = `%${q}%`;
    filters.push(
      or(
        like(schema.incidents.kind, pat),
        like(schema.incidents.componentPath, pat),
        like(schema.incidents.reason, pat),
      )!,
    );
  }
  const where = and(...filters);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.incidents)
    .where(where);
  const total = Number(countRow?.count ?? 0);

  const rows = await db
    .select()
    .from(schema.incidents)
    .where(where)
    .orderBy(
      sql`${schema.incidents.resolved} asc`,
      sql`case ${schema.incidents.severity} when 'critical' then 0 else 1 end asc`,
      desc(schema.incidents.startedAt),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    incidents: rows.map((i) => ({
      id: i.id,
      kind: i.kind,
      severity: i.severity ?? "critical",
      componentPath: i.componentPath ?? null,
      reason: i.reason ?? null,
      resolved: i.resolved,
      suppressed: i.suppressed,
      startedAt: i.startedAt.toISOString(),
      endedAt: i.endedAt ? i.endedAt.toISOString() : null,
    })),
    total,
    page,
    pageSize,
  };
}
