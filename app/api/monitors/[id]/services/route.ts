import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const AddBody = z.object({
  serviceName: z.string().min(1).max(200),
  source: z.string().max(60).default("manual"),
  tracked: z.boolean().default(true),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.monitorServices)
    .where(eq(schema.monitorServices.monitorId, Number(id)))
    .orderBy(schema.monitorServices.serviceName);
  return NextResponse.json({ services: rows });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const monitorId = Number(id);
  const parse = AddBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const now = new Date();
  const serviceName = parse.data.serviceName.trim().toUpperCase();
  const [existing] = await db
    .select()
    .from(schema.monitorServices)
    .where(
      and(
        eq(schema.monitorServices.monitorId, monitorId),
        eq(schema.monitorServices.serviceName, serviceName),
      ),
    );
  if (existing) {
    return NextResponse.json({ error: "already exists" }, { status: 409 });
  }
  const [row] = await db
    .insert(schema.monitorServices)
    .values({
      monitorId,
      serviceName,
      source: parse.data.source,
      tracked: parse.data.tracked,
      present: false,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning();
  return NextResponse.json({ service: row }, { status: 201 });
}
