import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z
  .object({
    afterMinutes: z.number().int().min(0).max(10080), // up to a week
    channelId: z.number().int().positive().optional(),
    scheduleId: z.number().int().positive().optional(),
  })
  // a step targets exactly one of: a fixed channel, or an on-call schedule
  .refine((b) => (b.channelId == null) !== (b.scheduleId == null), {
    message: "provide exactly one of channelId or scheduleId",
  });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const policyId = Number(id);
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();

  const [policy] = await db
    .select({ id: schema.escalationPolicies.id })
    .from(schema.escalationPolicies)
    .where(eq(schema.escalationPolicies.id, policyId));
  if (!policy) {
    return NextResponse.json({ error: "policy not found" }, { status: 404 });
  }
  if (parse.data.channelId != null) {
    const [channel] = await db
      .select({ id: schema.notificationChannels.id })
      .from(schema.notificationChannels)
      .where(eq(schema.notificationChannels.id, parse.data.channelId));
    if (!channel) {
      return NextResponse.json({ error: "channel not found" }, { status: 400 });
    }
  } else if (parse.data.scheduleId != null) {
    const [sched] = await db
      .select({ id: schema.oncallSchedules.id })
      .from(schema.oncallSchedules)
      .where(eq(schema.oncallSchedules.id, parse.data.scheduleId));
    if (!sched) {
      return NextResponse.json({ error: "schedule not found" }, { status: 400 });
    }
  }

  const [row] = await db
    .insert(schema.escalationSteps)
    .values({
      policyId,
      afterMinutes: parse.data.afterMinutes,
      channelId: parse.data.channelId ?? null,
      scheduleId: parse.data.scheduleId ?? null,
    })
    .returning();
  return NextResponse.json({ step: row }, { status: 201 });
}
