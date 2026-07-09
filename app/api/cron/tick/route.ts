import { NextResponse } from "next/server";
import { runDueChecks } from "@/lib/checker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await runDueChecks();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = GET;
