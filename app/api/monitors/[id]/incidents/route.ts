import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { loadMonitorIncidents } from "@/lib/incident-list";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await ctx.params;
  const monitorId = Number(id);
  if (!Number.isFinite(monitorId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const url = new URL(req.url);
  const result = await loadMonitorIncidents({
    monitorId,
    q: url.searchParams.get("q") ?? "",
    page: Number(url.searchParams.get("page") ?? "1"),
    pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
  });
  return NextResponse.json(result);
}
