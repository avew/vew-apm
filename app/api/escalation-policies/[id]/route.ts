import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { eq, ne } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const policyId = Number(id);
  const parse = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const db = getDb();
  // Only one policy is active at a time: activating this one deactivates the rest.
  if (parse.data.active === true) {
    await db
      .update(schema.escalationPolicies)
      .set({ active: false })
      .where(ne(schema.escalationPolicies.id, policyId));
  }
  const patch: Record<string, unknown> = {};
  if (parse.data.name !== undefined) patch.name = parse.data.name;
  if (parse.data.active !== undefined) patch.active = parse.data.active;
  if (Object.keys(patch).length > 0) {
    await db
      .update(schema.escalationPolicies)
      .set(patch)
      .where(eq(schema.escalationPolicies.id, policyId));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const db = getDb();
  await db
    .delete(schema.escalationPolicies)
    .where(eq(schema.escalationPolicies.id, Number(id)));
  return NextResponse.json({ ok: true });
}
