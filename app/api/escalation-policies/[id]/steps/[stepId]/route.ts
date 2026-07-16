import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  await requireUser();
  const { id, stepId } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.escalationSteps)
    .where(
      and(
        eq(schema.escalationSteps.id, Number(stepId)),
        eq(schema.escalationSteps.policyId, Number(id)),
      ),
    );
  return NextResponse.json({ ok: true });
}
