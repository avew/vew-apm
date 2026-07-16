import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  rotationDays: z.number().int().min(1).max(365).optional(),
  anchorAt: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const parse = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (parse.data.name !== undefined) patch.name = parse.data.name;
  if (parse.data.rotationDays !== undefined) patch.rotationDays = parse.data.rotationDays;
  if (parse.data.anchorAt !== undefined) patch.anchorAt = new Date(parse.data.anchorAt);
  if (Object.keys(patch).length > 0) {
    const db = getDb();
    await db
      .update(schema.oncallSchedules)
      .set(patch)
      .where(eq(schema.oncallSchedules.id, Number(id)));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.oncallSchedules)
    .where(eq(schema.oncallSchedules.id, Number(id)));
  return NextResponse.json({ ok: true });
}
