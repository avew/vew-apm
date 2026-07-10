import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { loadAlertSettings, updateAlertSettings } from "@/lib/alerts";

const Body = z.object({
  diskWarnPct: z.number().min(1).max(100).optional(),
  diskCritPct: z.number().min(1).max(100).optional(),
  downForMinutes: z.number().int().min(0).max(1440).optional(),
  latencyWarnMs: z.number().int().min(1).max(600000).optional(),
  latencyWindow: z.number().int().min(1).max(100).optional(),
  eurekaDropAlert: z.boolean().optional(),
  serviceGraceSeconds: z.number().int().min(0).max(86400).optional(),
  componentGraceSeconds: z.number().int().min(0).max(86400).optional(),
  renotifyMinutes: z.number().int().min(0).max(10080).optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(),
});

export async function GET() {
  await requireUser();
  const settings = await loadAlertSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  await updateAlertSettings(parse.data);
  return NextResponse.json({ ok: true });
}
