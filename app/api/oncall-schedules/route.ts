import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { asc } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({
  name: z.string().min(1).max(120),
  rotationDays: z.number().int().min(1).max(365).default(7),
  anchorAt: z.string().datetime().optional(),
});

export async function GET() {
  await requireUser();
  const db = getDb();
  const schedules = await db
    .select()
    .from(schema.oncallSchedules)
    .orderBy(asc(schema.oncallSchedules.id));
  const members = await db
    .select()
    .from(schema.oncallMembers)
    .orderBy(asc(schema.oncallMembers.position), asc(schema.oncallMembers.id));
  return NextResponse.json({ schedules, members });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const [row] = await db
    .insert(schema.oncallSchedules)
    .values({
      name: parse.data.name,
      rotationDays: parse.data.rotationDays,
      anchorAt: parse.data.anchorAt ? new Date(parse.data.anchorAt) : new Date(),
    })
    .returning();
  return NextResponse.json({ schedule: row }, { status: 201 });
}
