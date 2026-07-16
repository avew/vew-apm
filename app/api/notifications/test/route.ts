import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { sendTestConfig } from "@/lib/notifier";

const Body = z.object({
  kind: z.enum([
    "webhook",
    "email",
    "telegram",
    "slack",
    "discord",
    "teams",
    "pagerduty",
    "opsgenie",
  ]),
  config: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request) {
  await requireUser();
  const parse = Body.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  try {
    await sendTestConfig(parse.data.kind, parse.data.config);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
