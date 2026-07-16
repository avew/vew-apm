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
      type: m.type,
      expectStatus: m.expectStatus,
      keyword: m.keyword,
      statusPath: m.statusPath,
      statusUpValue: m.statusUpValue,
      intervalSeconds: m.intervalSeconds,
      timeoutMs: m.timeoutMs,
      authType: m.authType,
      authUsername: m.authUsername,
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
      componentGraceSeconds: m.componentGraceSeconds,
      renotifyMinutes: m.renotifyMinutes,
      group: m.group,
    })
    .returning();

  // Carry over prometheus metric rules so a cloned monitor keeps its alerts.
  const rules = await db
    .select()
    .from(schema.metricRules)
    .where(eq(schema.metricRules.monitorId, m.id));
  if (rules.length > 0) {
    await db.insert(schema.metricRules).values(
      rules.map((r) => ({
        monitorId: clone.id,
        label: r.label,
        metricName: r.metricName,
        labelMatchers: r.labelMatchers,
        operator: r.operator,
        warnValue: r.warnValue,
        critValue: r.critValue,
        enabled: r.enabled,
      })),
    );
  }

  return NextResponse.json({ id: clone.id }, { status: 201 });
}
