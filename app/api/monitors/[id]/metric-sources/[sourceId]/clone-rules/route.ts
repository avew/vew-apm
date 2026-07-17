import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

const Body = z.object({ targetSourceId: z.number().int() });

async function ids(ctx: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await ctx.params;
  const mid = Number(id);
  const sid = Number(sourceId);
  return Number.isFinite(mid) && Number.isFinite(sid) ? { mid, sid } : null;
}

/**
 * Copy every rule of one endpoint onto another endpoint of the same monitor —
 * set a service up once, then replicate the whole ruleset to its siblings. Rules
 * are copied verbatim with only the source retargeted. Returns how many landed.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "targetSourceId is required" }, { status: 400 });
  }
  const target = body.data.targetSourceId;
  if (target === parsed.sid) {
    return NextResponse.json(
      { error: "target must be a different endpoint" },
      { status: 400 },
    );
  }
  const db = getDb();

  // Both source and target must belong to this monitor.
  const owned = await db
    .select({ id: schema.metricSources.id })
    .from(schema.metricSources)
    .where(eq(schema.metricSources.monitorId, parsed.mid));
  const ownedIds = new Set(owned.map((s) => s.id));
  if (!ownedIds.has(parsed.sid) || !ownedIds.has(target)) {
    return NextResponse.json({ error: "unknown source" }, { status: 400 });
  }

  const rules = await db
    .select()
    .from(schema.metricRules)
    .where(
      and(
        eq(schema.metricRules.monitorId, parsed.mid),
        eq(schema.metricRules.sourceId, parsed.sid),
      ),
    );
  if (rules.length === 0) {
    return NextResponse.json({ cloned: 0 });
  }

  const rows = rules.map((r) => ({
    monitorId: parsed.mid,
    sourceId: target,
    label: r.label,
    metricName: r.metricName,
    labelMatchers: r.labelMatchers,
    operator: r.operator,
    mode: r.mode,
    windowSeconds: r.windowSeconds,
    warnValue: r.warnValue,
    critValue: r.critValue,
    enabled: r.enabled,
  }));
  await db.insert(schema.metricRules).values(rows);
  return NextResponse.json({ cloned: rows.length }, { status: 201 });
}
