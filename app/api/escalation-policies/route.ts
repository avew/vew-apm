import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { asc } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Body = z.object({ name: z.string().min(1).max(120) });

export async function GET() {
  await requireUser();
  const db = getDb();
  const policies = await db
    .select()
    .from(schema.escalationPolicies)
    .orderBy(asc(schema.escalationPolicies.id));
  const steps = await db
    .select()
    .from(schema.escalationSteps)
    .orderBy(asc(schema.escalationSteps.afterMinutes));
  return NextResponse.json({ policies, steps });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  const [row] = await db
    .insert(schema.escalationPolicies)
    .values({ name: parse.data.name })
    .returning();
  return NextResponse.json({ policy: row }, { status: 201 });
}
