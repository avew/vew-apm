import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { eq } from "drizzle-orm";

const AuthFields = {
  authType: z.enum(["none", "basic", "header", "bearer"]).optional(),
  authUsername: z.string().max(200).nullable().optional(),
  authHeaderName: z.string().max(200).nullable().optional(),
  authHeaderValue: z.string().max(4000).nullable().optional(),
};

const CreateBody = z.object({
  label: z.string().min(1).max(120),
  url: z.string().url(),
  ...AuthFields,
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
  // Never ship the secret (authHeaderValue) to the client — expose only a flag
  // so the form can render "unchanged" and leave blank = keep.
  const rows = await db
    .select({
      id: schema.metricSources.id,
      monitorId: schema.metricSources.monitorId,
      label: schema.metricSources.label,
      url: schema.metricSources.url,
      authType: schema.metricSources.authType,
      authUsername: schema.metricSources.authUsername,
      authHeaderName: schema.metricSources.authHeaderName,
      authHeaderValue: schema.metricSources.authHeaderValue,
      createdAt: schema.metricSources.createdAt,
    })
    .from(schema.metricSources)
    .where(eq(schema.metricSources.monitorId, mid))
    .orderBy(schema.metricSources.id);
  const sources = rows.map(({ authHeaderValue, ...s }) => ({
    ...s,
    hasAuthSecret: authHeaderValue != null && authHeaderValue !== "",
  }));
  return NextResponse.json({ sources });
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
  const [source] = await db
    .insert(schema.metricSources)
    .values({
      monitorId: mid,
      label: d.label,
      url: d.url,
      authType: d.authType ?? "none",
      authUsername: d.authUsername ?? null,
      authHeaderName: d.authHeaderName ?? null,
      authHeaderValue: d.authHeaderValue ?? null,
    })
    .returning({ id: schema.metricSources.id });
  return NextResponse.json({ id: source.id }, { status: 201 });
}
