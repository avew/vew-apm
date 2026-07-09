import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  const override = parse.success ? parse.data : {};
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
      name: override.name?.trim() || `${m.name} (copy)`,
      url: override.url?.trim() || m.url,
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

  return NextResponse.json({ id: clone.id }, { status: 201 });
}
