import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({
  responderId: z.number().int().positive(),
  position: z.number().int().min(0).max(1000).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const scheduleId = Number(id);
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const [sched] = await db
    .select({ id: schema.oncallSchedules.id })
    .from(schema.oncallSchedules)
    .where(eq(schema.oncallSchedules.id, scheduleId));
  if (!sched) {
    return NextResponse.json({ error: "schedule not found" }, { status: 404 });
  }
  const [resp] = await db
    .select({ id: schema.responders.id })
    .from(schema.responders)
    .where(eq(schema.responders.id, parse.data.responderId));
  if (!resp) {
    return NextResponse.json({ error: "responder not found" }, { status: 400 });
  }

  // Default position = append to the end of the rotation.
  let position = parse.data.position;
  if (position === undefined) {
    const existing = await db
      .select({ position: schema.oncallMembers.position })
      .from(schema.oncallMembers)
      .where(eq(schema.oncallMembers.scheduleId, scheduleId));
    position = existing.reduce((max, m) => Math.max(max, m.position + 1), 0);
  }

  const [row] = await db
    .insert(schema.oncallMembers)
    .values({ scheduleId, responderId: parse.data.responderId, position })
    .returning();
  return NextResponse.json({ member: row }, { status: 201 });
}
