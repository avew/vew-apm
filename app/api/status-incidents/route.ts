import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  INCIDENT_STATUSES,
  INCIDENT_IMPACTS,
  createStatusIncident,
  listStatusIncidents,
} from "@/lib/status-incidents";

const Body = z.object({
  title: z.string().min(1).max(200),
  impact: z.enum(INCIDENT_IMPACTS),
  status: z.enum(INCIDENT_STATUSES).default("investigating"),
  body: z.string().min(1).max(5000),
});

export async function GET() {
  await requireUser();
  return NextResponse.json({ incidents: await listStatusIncidents() });
}

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const id = createStatusIncident(parse.data);
  return NextResponse.json({ id }, { status: 201 });
}
