import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  INCIDENT_STATUSES,
  addStatusIncidentUpdate,
  deleteStatusIncident,
} from "@/lib/status-incidents";

const UpdateBody = z.object({
  status: z.enum(INCIDENT_STATUSES),
  body: z.string().min(1).max(5000),
});

async function getId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n)) throw new Error("bad id");
  return n;
}

// Append an update to an incident (advances its status).
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const id = await getId(ctx);
  const parse = UpdateBody.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  addStatusIncidentUpdate(id, parse.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const id = await getId(ctx);
  await deleteStatusIncident(id);
  return NextResponse.json({ ok: true });
}
