import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

const Body = z.object({ targetSourceId: z.number().int() });

async function ids(ctx: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await ctx.params;
  const mid = Number(id);
  const rid = Number(ruleId);
  return Number.isFinite(mid) && Number.isFinite(rid) ? { mid, rid } : null;
}

/**
 * Duplicate one rule onto another endpoint of the same monitor. The same Spring
 * template usually exposes identical metrics across services, so a rule is copied
 * verbatim (metric, matchers, mode, window, operator, thresholds) with only its
 * source retargeted.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; ruleId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "targetSourceId is required" }, { status: 400 });
  }
  const db = getDb();

  const [rule] = await db
    .select()
    .from(schema.metricRules)
    .where(
      and(
        eq(schema.metricRules.id, parsed.rid),
        eq(schema.metricRules.monitorId, parsed.mid),
      ),
    );
  if (!rule) return NextResponse.json({ error: "rule not found" }, { status: 404 });

  // Target source must belong to this monitor.
  const [target] = await db
    .select({ id: schema.metricSources.id })
    .from(schema.metricSources)
    .where(
      and(
        eq(schema.metricSources.id, body.data.targetSourceId),
        eq(schema.metricSources.monitorId, parsed.mid),
      ),
    );
  if (!target) return NextResponse.json({ error: "unknown target source" }, { status: 400 });

  const [clone] = await db
    .insert(schema.metricRules)
    .values({
      monitorId: parsed.mid,
      sourceId: target.id,
      label: rule.label,
      metricName: rule.metricName,
      labelMatchers: rule.labelMatchers,
      operator: rule.operator,
      mode: rule.mode,
      windowSeconds: rule.windowSeconds,
      warnValue: rule.warnValue,
      critValue: rule.critValue,
      enabled: rule.enabled,
    })
    .returning();
  return NextResponse.json({ rule: clone }, { status: 201 });
}
