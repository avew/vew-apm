import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { readBodyCapped } from "@/lib/checker";
import { buildAuthHeaders } from "@/lib/auth-header";
import { and, eq } from "drizzle-orm";

async function ids(ctx: { params: Promise<{ id: string; sourceId: string }> }) {
  const { id, sourceId } = await ctx.params;
  const mid = Number(id);
  const sid = Number(sourceId);
  return Number.isFinite(mid) && Number.isFinite(sid) ? { mid, sid } : null;
}

// Scrape a saved source server-side so the operator can verify the endpoint +
// its stored credentials without the secret ever leaving the server. Uses the
// source's own auth, falling back to the monitor's auth when the source sets none.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; sourceId: string }> },
) {
  await requireUser();
  const parsed = await ids(ctx);
  if (!parsed) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  const [source] = await db
    .select()
    .from(schema.metricSources)
    .where(
      and(
        eq(schema.metricSources.id, parsed.sid),
        eq(schema.metricSources.monitorId, parsed.mid),
      ),
    );
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [monitor] = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.id, parsed.mid));

  const useSource = source.authType != null && source.authType !== "none";
  const authHeaders = buildAuthHeaders(useSource || !monitor ? source : monitor);

  try {
    const res = await fetch(source.url, {
      method: "GET",
      headers: { accept: "text/plain", ...authHeaders },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const { text, tooLarge } = await readBodyCapped(res);
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      body: tooLarge ? "(response too large)" : (text ?? "").slice(0, 20000),
    });
  } catch (e) {
    return NextResponse.json({ fetchError: (e as Error).message });
  }
}
