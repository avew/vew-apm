import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
  method: z.enum(["GET", "POST"]).optional(),
  intervalSeconds: z.number().int().min(10).max(86400).optional(),
  timeoutMs: z.number().int().min(500).max(60000).optional(),
  authHeaderName: z.string().max(120).nullable().optional(),
  authHeaderValue: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  // Alert threshold overrides (null = clear override → inherit global)
  diskWarnPct: z.number().min(1).max(100).nullable().optional(),
  diskCritPct: z.number().min(1).max(100).nullable().optional(),
  downForMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  latencyWarnMs: z.number().int().min(1).max(600000).nullable().optional(),
  latencyWindow: z.number().int().min(1).max(100).nullable().optional(),
  eurekaDropAlert: z.boolean().nullable().optional(),
  serviceGraceSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  componentGraceSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  renotifyMinutes: z.number().int().min(0).max(10080).nullable().optional(),
});

async function getId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n)) throw new Error("bad id");
  return n;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = await getId(ctx);
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ monitor: row });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const id = await getId(ctx);
  const parse = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const updates = parse.data;
  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.monitors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.monitors.id, id));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const id = await getId(ctx);
  const db = getDb();
  await db.delete(schema.monitors).where(eq(schema.monitors.id, id));
  return NextResponse.json({ ok: true });
}
