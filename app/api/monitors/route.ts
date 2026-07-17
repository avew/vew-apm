import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  type: z.enum(["actuator", "http", "json", "prometheus"]).default("actuator"),
  expectStatus: z.string().max(20).nullish(),
  keyword: z.string().max(200).nullish(),
  statusPath: z.string().max(200).nullish(),
  statusUpValue: z.string().max(100).nullish(),
  intervalSeconds: z.number().int().min(10).max(86400).default(60),
  timeoutMs: z.number().int().min(500).max(60000).default(10000),
  authType: z.enum(["none", "basic", "header", "bearer"]).default("none"),
  authUsername: z.string().max(200).nullish(),
  authHeaderName: z.string().max(120).optional(),
  authHeaderValue: z.string().max(2000).optional(),
  enabled: z.boolean().default(true),
  group: z.string().max(80).nullish(),
  // Alert threshold overrides (null/omit = inherit global)
  diskWarnPct: z.number().min(1).max(100).nullish(),
  diskCritPct: z.number().min(1).max(100).nullish(),
  downForMinutes: z.number().int().min(0).max(1440).nullish(),
  latencyWarnMs: z.number().int().min(1).max(600000).nullish(),
  latencyWindow: z.number().int().min(1).max(100).nullish(),
  eurekaDropAlert: z.boolean().nullish(),
  serviceGraceSeconds: z.number().int().min(0).max(86400).nullish(),
  componentGraceSeconds: z.number().int().min(0).max(86400).nullish(),
  renotifyMinutes: z.number().int().min(0).max(10080).nullish(),
  dependsOn: z.number().int().positive().nullish(),
  escalationPolicyId: z.number().int().positive().nullish(),
});

export async function GET() {
  await requireUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.monitors)
    .orderBy(desc(schema.monitors.createdAt));
  return NextResponse.json({ monitors: rows });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json(
      { error: "invalid input", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const db = getDb();
  const m = parse.data;
  const [row] = await db
    .insert(schema.monitors)
    .values({
      name: m.name,
      url: m.url,
      method: m.method,
      type: m.type,
      expectStatus: m.expectStatus?.trim() || null,
      keyword: m.keyword?.trim() || null,
      statusPath: m.statusPath?.trim() || null,
      statusUpValue: m.statusUpValue?.trim() || null,
      intervalSeconds: m.intervalSeconds,
      timeoutMs: m.timeoutMs,
      authType: m.authType,
      authUsername: m.authUsername?.trim() || null,
      authHeaderName: m.authHeaderName ?? null,
      authHeaderValue: m.authHeaderValue ?? null,
      enabled: m.enabled,
      group: m.group?.trim() || null,
      dependsOn: m.dependsOn ?? null,
      escalationPolicyId: m.escalationPolicyId ?? null,
      diskWarnPct: m.diskWarnPct ?? null,
      diskCritPct: m.diskCritPct ?? null,
      downForMinutes: m.downForMinutes ?? null,
      latencyWarnMs: m.latencyWarnMs ?? null,
      latencyWindow: m.latencyWindow ?? null,
      eurekaDropAlert: m.eurekaDropAlert ?? null,
      serviceGraceSeconds: m.serviceGraceSeconds ?? null,
      componentGraceSeconds: m.componentGraceSeconds ?? null,
      renotifyMinutes: m.renotifyMinutes ?? null,
    })
    .returning();

  // A prometheus monitor's own URL is a metrics endpoint — seed it as the first
  // metric source so the type works out of the box (more can be added later).
  if (row.type === "prometheus") {
    await db
      .insert(schema.metricSources)
      .values({ monitorId: row.id, label: "default", url: row.url });
  }

  return NextResponse.json({ monitor: row }, { status: 201 });
}
