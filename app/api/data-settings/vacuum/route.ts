import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { vacuumDb } from "@/lib/db-stats";

// Compact the DB on demand (reclaim pruned space + truncate WAL). Operator
// action from Settings → Data.
export async function POST() {
  await requireUser();
  try {
    const { before, after } = vacuumDb();
    return NextResponse.json({
      ok: true,
      before,
      after,
      reclaimedBytes: Math.max(0, before.totalBytes - after.totalBytes),
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "vacuum failed" },
      { status: 500 },
    );
  }
}
