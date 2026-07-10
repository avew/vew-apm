import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getSchedulerStatus } from "@/lib/scheduler";

// Own-health probe for Vew APM (distinct from the actuator health it monitors).
// Public (see middleware) so Docker HEALTHCHECK / orchestrators can poll it.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let healthy = true;

  // 1. Database reachable?
  try {
    getDb().get(sql`SELECT 1`);
    checks.db = "ok";
  } catch (err) {
    healthy = false;
    checks.db = "error";
    checks.dbError = (err as Error).message;
  }

  // 2. In-process scheduler ticking recently?
  const s = getSchedulerStatus();
  const tickMs = Number(process.env.APM_SCHEDULER_TICK_MS ?? 5000);
  const staleMs = Math.max(tickMs * 3, 30_000);
  const sinceTick = s.lastTickAt > 0 ? Date.now() - s.lastTickAt : null;

  if (s.disabled) {
    // Checks driven externally (e.g. /api/cron/tick) — not a failure.
    checks.scheduler = "disabled";
  } else if (!s.started) {
    healthy = false;
    checks.scheduler = "not-started";
  } else if (sinceTick === null) {
    // Booted, first tick not yet recorded — treat as starting, not a failure.
    checks.scheduler = "starting";
  } else if (sinceTick > staleMs) {
    healthy = false;
    checks.scheduler = "stale";
    checks.sinceTickMs = sinceTick;
  } else {
    checks.scheduler = "ok";
    checks.sinceTickMs = sinceTick;
  }

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", ...checks },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
