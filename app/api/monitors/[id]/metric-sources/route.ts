import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { eq } from "drizzle-orm";

const CreateBody = z.object({
  label: z.string().min(1).max(120),
  url: z.string().url(),
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
  const sources = await db
    .select()
    .from(schema.metricSources)
    .where(eq(schema.metricSources.monitorId, mid))
    .orderBy(schema.metricSources.id);
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
  const db = getDb();
  const [source] = await db
    .insert(schema.metricSources)
    .values({ monitorId: mid, label: parse.data.label, url: parse.data.url })
    .returning();
  return NextResponse.json({ source }, { status: 201 });
}
