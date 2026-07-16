import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

const PatchBody = z.object({
  sourceId: z.number().int().optional(),
  label: z.string().min(1).max(120).optional(),
  metricName: z.string().min(1).max(200).optional(),
  labelMatchers: z.record(z.string(), z.string()).nullish(),
  operator: z.enum(["gt", "gte", "lt", "lte"]).optional(),
  warnValue: z.number().nullish(),
  critValue: z.number().nullish(),
  enabled: z.boolean().optional(),
});

async function ids(ctx: { params: Promise<{ id: string; ruleId: string }> }) {
  const { id, ruleId } = await ctx.params;
  const mid = Number(id);
  const rid = Number(ruleId);
  return Number.isFinite(mid) && Number.isFinite(rid) ? { mid, rid } : null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; ruleId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid input", issues: body.error.issues },
      { status: 400 },
    );
  }
  // Only assign fields that were provided (labelMatchers null clears the matcher).
  const d = body.data;
  const updates: Record<string, unknown> = {};
  if (d.sourceId !== undefined) updates.sourceId = d.sourceId;
  if (d.label !== undefined) updates.label = d.label;
  if (d.metricName !== undefined) updates.metricName = d.metricName;
  if (d.labelMatchers !== undefined) updates.labelMatchers = d.labelMatchers ?? null;
  if (d.operator !== undefined) updates.operator = d.operator;
  if (d.warnValue !== undefined) updates.warnValue = d.warnValue;
  if (d.critValue !== undefined) updates.critValue = d.critValue;
  if (d.enabled !== undefined) updates.enabled = d.enabled;

  const db = getDb();
  await db
    .update(schema.metricRules)
    .set(updates)
    .where(
      and(
        eq(schema.metricRules.id, parsed.rid),
        eq(schema.metricRules.monitorId, parsed.mid),
      ),
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; ruleId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  await db
    .delete(schema.metricRules)
    .where(
      and(
        eq(schema.metricRules.id, parsed.rid),
        eq(schema.metricRules.monitorId, parsed.mid),
      ),
    );
  return NextResponse.json({ ok: true });
}
