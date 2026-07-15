import { getSqlite } from "@/lib/db/client";
import { statSync } from "node:fs";
import path from "node:path";

/** Resolve the SQLite file path the same way lib/db/client.ts does. */
function dbFilePath(): string {
  const raw = process.env.DATABASE_URL ?? "./data/apm.db";
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.resolve(stripped);
}

function fileBytes(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

export interface DbStats {
  /** Main .db file size on disk. */
  dbBytes: number;
  /** -wal sidecar size (uncheckpointed writes). */
  walBytes: number;
  /** db + wal. */
  totalBytes: number;
  /** Free pages inside the .db that a VACUUM would return to the OS. */
  reclaimableBytes: number;
}

export function getDbStats(): DbStats {
  const sq = getSqlite();
  const pageSize = sq.pragma("page_size", { simple: true }) as number;
  const freelist = sq.pragma("freelist_count", { simple: true }) as number;
  const file = dbFilePath();
  const dbBytes = fileBytes(file);
  const walBytes = fileBytes(`${file}-wal`);
  return {
    dbBytes,
    walBytes,
    totalBytes: dbBytes + walBytes,
    reclaimableBytes: freelist * pageSize,
  };
}

/**
 * Compact the database (VACUUM) and truncate the WAL, returning before/after
 * sizes. VACUUM rewrites the file without the free pages left by pruning, so the
 * file actually shrinks on disk (SQLite never does this automatically here —
 * auto_vacuum is off). Briefly exclusive-locks the DB.
 */
export function vacuumDb(): { before: DbStats; after: DbStats } {
  const sq = getSqlite();
  const before = getDbStats();
  sq.exec("VACUUM");
  sq.pragma("wal_checkpoint(TRUNCATE)");
  const after = getDbStats();
  return { before, after };
}
