import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({
  name: z.string().min(1).max(120),
  scope: z.enum(["global", "monitor"]),
  monitorId: z.number().int().nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
  reason: z.string().max(500).optional(),
});

export async function GET() {
  await requireUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.maintenanceWindows)
    .orderBy(desc(schema.maintenanceWindows.startsAt));
  return NextResponse.json({ windows: rows });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const d = parse.data;
  const startsAt = new Date(d.startsAt);
  const endsAt = new Date(d.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "invalid dates" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json(
      { error: "endsAt must be after startsAt" },
      { status: 400 },
    );
  }
  if (d.scope === "monitor" && !d.monitorId) {
    return NextResponse.json(
      { error: "monitorId required for scope=monitor" },
      { status: 400 },
    );
  }
  const db = getDb();
  const [row] = await db
    .insert(schema.maintenanceWindows)
    .values({
      name: d.name,
      scope: d.scope,
      monitorId: d.scope === "monitor" ? (d.monitorId ?? null) : null,
      startsAt,
      endsAt,
      recurrence: d.recurrence,
      reason: d.reason ?? null,
    })
    .returning();
  return NextResponse.json({ window: row }, { status: 201 });
}
