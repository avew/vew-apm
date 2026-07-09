import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

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

  const now = new Date();
  const [clone] = await db
    .insert(schema.monitors)
    .values({
      name: `${m.name} (copy)`,
      url: m.url,
      method: m.method,
      intervalSeconds: m.intervalSeconds,
      timeoutMs: m.timeoutMs,
      authHeaderName: m.authHeaderName,
      authHeaderValue: m.authHeaderValue,
      enabled: m.enabled,
      nextCheckAt: now,
      diskWarnPct: m.diskWarnPct,
      diskCritPct: m.diskCritPct,
      downForMinutes: m.downForMinutes,
      latencyWarnMs: m.latencyWarnMs,
      latencyWindow: m.latencyWindow,
      eurekaDropAlert: m.eurekaDropAlert,
      serviceGraceSeconds: m.serviceGraceSeconds,
    })
    .returning();

  // copy notification channel links
  const links = await db
    .select({ channelId: schema.monitorChannels.channelId })
    .from(schema.monitorChannels)
    .where(eq(schema.monitorChannels.monitorId, m.id));
  if (links.length > 0) {
    await db.insert(schema.monitorChannels).values(
      links.map((l) => ({ monitorId: clone.id, channelId: l.channelId })),
    );
  }

  return NextResponse.json({ id: clone.id }, { status: 201 });
}
