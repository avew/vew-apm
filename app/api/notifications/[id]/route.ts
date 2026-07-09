import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Patch = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
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
  const db = getDb();
  const payload: Record<string, unknown> = { ...parse.data };
  if (payload.config) payload.config = payload.config as object;
  await db
    .update(schema.notificationChannels)
    .set(payload as Partial<typeof schema.notificationChannels.$inferInsert>)
    .where(eq(schema.notificationChannels.id, Number(id)));
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
    .delete(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, Number(id)));
  return NextResponse.json({ ok: true });
}
