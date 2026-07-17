import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

// windowSeconds is required (and positive) for any non-instant trend mode, and
// forced null for instant so the two never disagree.
const WINDOW_MAX = 86_400; // 24h — a trailing alert window beyond this is nonsense
const CreateBody = z
  .object({
    sourceId: z.number().int(),
    label: z.string().min(1).max(120),
    metricName: z.string().min(1).max(200),
    labelMatchers: z.record(z.string(), z.string()).nullish(),
    operator: z.enum(["gt", "gte", "lt", "lte"]).default("gt"),
    mode: z.enum(["instant", "sustained", "delta", "rate"]).default("instant"),
    windowSeconds: z.number().int().positive().max(WINDOW_MAX).nullish(),
    warnValue: z.number().nullish(),
    critValue: z.number().nullish(),
    enabled: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.mode !== "instant" && !d.windowSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowSeconds"],
        message: "windowSeconds is required for a trend mode",
      });
    }
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
  // The source must belong to this monitor.
  const [src] = await db
    .select({ id: schema.metricSources.id })
    .from(schema.metricSources)
    .where(
      and(
        eq(schema.metricSources.id, d.sourceId),
        eq(schema.metricSources.monitorId, mid),
      ),
    );
  if (!src) return NextResponse.json({ error: "unknown source" }, { status: 400 });
  const [rule] = await db
    .insert(schema.metricRules)
    .values({
      monitorId: mid,
      sourceId: d.sourceId,
      label: d.label,
      metricName: d.metricName,
      labelMatchers: (d.labelMatchers ?? null) as object | null,
      operator: d.operator,
      mode: d.mode,
      windowSeconds: d.mode === "instant" ? null : (d.windowSeconds ?? null),
      warnValue: d.warnValue ?? null,
      critValue: d.critValue ?? null,
      enabled: d.enabled,
    })
    .returning();
  return NextResponse.json({ rule }, { status: 201 });
}
