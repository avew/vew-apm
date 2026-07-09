import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { sendTest } from "@/lib/notifier";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  try {
    await sendTest(Number(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
