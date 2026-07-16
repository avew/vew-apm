import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; routeId: string }> },
) {
  await requireUser();
  const { id, routeId } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.channelRoutes)
    .where(
      and(
        eq(schema.channelRoutes.id, Number(routeId)),
        eq(schema.channelRoutes.channelId, Number(id)),
      ),
    );
  return NextResponse.json({ ok: true });
}
