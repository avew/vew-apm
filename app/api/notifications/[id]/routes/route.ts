import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const RouteBody = z.object({
  scope: z.enum(["all", "group", "monitor"]),
  targetId: z.string().min(1).max(200).nullable().optional(),
  minSeverity: z.enum(["warning", "critical"]).default("warning"),
  alertKinds: z.array(z.string().min(1)).nullable().optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.channelRoutes)
    .where(eq(schema.channelRoutes.channelId, Number(id)))
    .orderBy(asc(schema.channelRoutes.id));
  return NextResponse.json({ routes: rows });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const parse = RouteBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const data = parse.data;
  // group / monitor scopes need a target; "all" must not carry one
  if (data.scope !== "all" && !data.targetId) {
    return NextResponse.json(
      { error: `scope "${data.scope}" requires a target` },
      { status: 400 },
    );
  }

  const db = getDb();
  // guard against orphan routes on a channel that does not exist
  const [channel] = await db
    .select({ id: schema.notificationChannels.id })
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, Number(id)));
  if (!channel) {
    return NextResponse.json({ error: "channel not found" }, { status: 404 });
  }

  const [row] = await db
    .insert(schema.channelRoutes)
    .values({
      channelId: Number(id),
      scope: data.scope,
      targetId: data.scope === "all" ? null : data.targetId ?? null,
      minSeverity: data.minSeverity,
      alertKinds:
        data.alertKinds && data.alertKinds.length > 0 ? data.alertKinds : null,
    })
    .returning();
  return NextResponse.json({ route: row }, { status: 201 });
}
