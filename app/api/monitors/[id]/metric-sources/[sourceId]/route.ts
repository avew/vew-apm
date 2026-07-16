import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

const PatchBody = z.object({
  label: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
});

async function ids(ctx: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await ctx.params;
  const mid = Number(id);
  const sid = Number(sourceId);
  return Number.isFinite(mid) && Number.isFinite(sid) ? { mid, sid } : null;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
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
  const updates: Record<string, unknown> = {};
  if (body.data.label !== undefined) updates.label = body.data.label;
  if (body.data.url !== undefined) updates.url = body.data.url;
  const db = getDb();
  await db
    .update(schema.metricSources)
    .set(updates)
    .where(
      and(
        eq(schema.metricSources.id, parsed.sid),
        eq(schema.metricSources.monitorId, parsed.mid),
      ),
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  // Rules referencing this source cascade-delete via the FK.
  await db
    .delete(schema.metricSources)
    .where(
      and(
        eq(schema.metricSources.id, parsed.sid),
        eq(schema.metricSources.monitorId, parsed.mid),
      ),
    );
  return NextResponse.json({ ok: true });
}
