import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({
  name: z.string().min(1).max(120),
  channelId: z.number().int().positive(),
});

export async function GET() {
  await requireUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.responders)
    .orderBy(asc(schema.responders.name));
  return NextResponse.json({ responders: rows });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const [channel] = await db
    .select({ id: schema.notificationChannels.id })
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.id, parse.data.channelId));
  if (!channel) {
    return NextResponse.json({ error: "channel not found" }, { status: 400 });
  }
  const [row] = await db
    .insert(schema.responders)
    .values({ name: parse.data.name, channelId: parse.data.channelId })
    .returning();
  return NextResponse.json({ responder: row }, { status: 201 });
}
