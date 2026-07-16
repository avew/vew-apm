import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { eq } from "drizzle-orm";

const CreateBody = z.object({
  label: z.string().min(1).max(120),
  metricName: z.string().min(1).max(200),
  labelMatchers: z.record(z.string(), z.string()).nullish(),
  operator: z.enum(["gt", "gte", "lt", "lte"]).default("gt"),
  warnValue: z.number().nullish(),
  critValue: z.number().nullish(),
  enabled: z.boolean().default(true),
});

async function monitorId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const mid = await monitorId(ctx);
  if (mid === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  const rules = await db
    .select()
    .from(schema.metricRules)
    .where(eq(schema.metricRules.monitorId, mid))
    .orderBy(schema.metricRules.id);
  return NextResponse.json({ rules });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const mid = await monitorId(ctx);
  if (mid === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const parse = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const d = parse.data;
  const db = getDb();
  const [rule] = await db
    .insert(schema.metricRules)
    .values({
      monitorId: mid,
      label: d.label,
      metricName: d.metricName,
      labelMatchers: (d.labelMatchers ?? null) as object | null,
      operator: d.operator,
      warnValue: d.warnValue ?? null,
      critValue: d.critValue ?? null,
      enabled: d.enabled,
    })
    .returning();
  return NextResponse.json({ rule }, { status: 201 });
}
