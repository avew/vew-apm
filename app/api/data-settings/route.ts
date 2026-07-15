import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { loadAlertSettings, updateAlertSettings } from "@/lib/alerts";
import { getDbStats } from "@/lib/db-stats";

// Data-management settings. Retention lives on the alert_settings row (no schema
// change), but it's an operational concern — surfaced under Settings → Data,
// not Alerts.
const Body = z.object({
  retentionDays: z.number().int().min(0).max(3650),
});

export async function GET() {
  await requireUser();
  const settings = await loadAlertSettings();
  return NextResponse.json({
    retentionDays: settings.retentionDays,
    stats: getDbStats(),
  });
}

export async function PATCH(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  await updateAlertSettings({ retentionDays: parse.data.retentionDays });
  return NextResponse.json({ ok: true });
}
