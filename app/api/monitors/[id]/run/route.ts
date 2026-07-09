import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { runCheck } from "@/lib/checker";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, Number(id)));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  await runCheck(m);
  return NextResponse.json({ ok: true });
}
