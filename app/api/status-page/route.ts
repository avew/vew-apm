import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { loadStatusPageSettings, updateStatusPageSettings } from "@/lib/status";

const Body = z.object({
  enabled: z.boolean().optional(),
  title: z.string().min(1).max(120).optional(),
});

export async function GET() {
  await requireUser();
  const settings = await loadStatusPageSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  await updateStatusPageSettings(parse.data);
  return NextResponse.json({ ok: true });
}
