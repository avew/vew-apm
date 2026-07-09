import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const PatchBody = z.object({
  tracked: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sid: string }> },
) {
  await requireUser();
  const { id, sid } = await ctx.params;
  const parse = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  await db
    .update(schema.monitorServices)
    .set(parse.data)
    .where(
      and(
        eq(schema.monitorServices.id, Number(sid)),
        eq(schema.monitorServices.monitorId, Number(id)),
      ),
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; sid: string }> },
) {
  await requireUser();
  const { id, sid } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.monitorServices)
    .where(
      and(
        eq(schema.monitorServices.id, Number(sid)),
        eq(schema.monitorServices.monitorId, Number(id)),
      ),
    );
  return NextResponse.json({ ok: true });
}
