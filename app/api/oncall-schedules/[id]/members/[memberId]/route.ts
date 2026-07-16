import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  await requireUser();
  const { id, memberId } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.oncallMembers)
    .where(
      and(
        eq(schema.oncallMembers.id, Number(memberId)),
        eq(schema.oncallMembers.scheduleId, Number(id)),
      ),
    );
  return NextResponse.json({ ok: true });
}
