import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  intervalSeconds: z.number().int().min(10).max(86400).default(60),
  timeoutMs: z.number().int().min(500).max(60000).default(10000),
  authHeaderName: z.string().max(120).optional(),
  authHeaderValue: z.string().max(2000).optional(),
  enabled: z.boolean().default(true),
  channelIds: z.array(z.number().int()).default([]),
  // Alert threshold overrides (null/omit = inherit global)
  diskWarnPct: z.number().min(1).max(100).nullish(),
  diskCritPct: z.number().min(1).max(100).nullish(),
  downForMinutes: z.number().int().min(0).max(1440).nullish(),
  latencyWarnMs: z.number().int().min(1).max(600000).nullish(),
  latencyWindow: z.number().int().min(1).max(100).nullish(),
  eurekaDropAlert: z.boolean().nullish(),
  serviceGraceSeconds: z.number().int().min(0).max(86400).nullish(),
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
  const { channelIds, ...m } = parse.data;
  const [row] = await db
    .insert(schema.monitors)
    .values({
      name: m.name,
      url: m.url,
      method: m.method,
      intervalSeconds: m.intervalSeconds,
      timeoutMs: m.timeoutMs,
      authHeaderName: m.authHeaderName ?? null,
      authHeaderValue: m.authHeaderValue ?? null,
      enabled: m.enabled,
      diskWarnPct: m.diskWarnPct ?? null,
      diskCritPct: m.diskCritPct ?? null,
      downForMinutes: m.downForMinutes ?? null,
      latencyWarnMs: m.latencyWarnMs ?? null,
      latencyWindow: m.latencyWindow ?? null,
      eurekaDropAlert: m.eurekaDropAlert ?? null,
      serviceGraceSeconds: m.serviceGraceSeconds ?? null,
    })
    .returning();
  if (channelIds.length > 0) {
    await db.insert(schema.monitorChannels).values(
      channelIds.map((cid) => ({ monitorId: row.id, channelId: cid })),
    );
  }
  return NextResponse.json({ monitor: row }, { status: 201 });
}
