import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { and, eq } from "drizzle-orm";

const PatchBody = z.object({
  label: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
  authType: z.enum(["none", "basic", "header", "bearer"]).optional(),
  authUsername: z.string().max(200).nullable().optional(),
  authHeaderName: z.string().max(200).nullable().optional(),
  // Secret: omit to keep the stored value; send a string to replace it. Because
  // it's its own column, an absent field leaves the stored secret untouched.
  authHeaderValue: z.string().max(4000).nullable().optional(),
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
  if (body.data.authType !== undefined) updates.authType = body.data.authType;
  if (body.data.authUsername !== undefined) updates.authUsername = body.data.authUsername;
  if (body.data.authHeaderName !== undefined)
    updates.authHeaderName = body.data.authHeaderName;
  // Only overwrite the secret when the field is present (blank on edit = keep).
  if (body.data.authHeaderValue !== undefined)
    updates.authHeaderValue = body.data.authHeaderValue;
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
  // Delete the source's rules first (their samples cascade). SQLite ADD COLUMN
  // can't carry ON DELETE CASCADE, so metric_rules.source_id is NO ACTION at the
  // DB level — removing the rules explicitly avoids an FK constraint error.
  await db.delete(schema.metricRules).where(eq(schema.metricRules.sourceId, parsed.sid));
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
