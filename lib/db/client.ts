import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

type Sqlite = InstanceType<typeof Database>;

let cached: ReturnType<typeof drizzle> | null = null;
let cachedSqlite: Sqlite | null = null;

function resolvePath(): string {
  const raw = process.env.DATABASE_URL ?? "./data/apm.db";
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.resolve(stripped);
}

export function getDb() {
  if (cached) return cached;
  const file = resolvePath();
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait up to 5s for a lock instead of throwing SQLITE_BUSY immediately — the
  // in-process scheduler and web requests both write, and WAL only lets one
  // writer at a time, so brief writer-vs-writer contention is expected.
  sqlite.pragma("busy_timeout = 5000");
  // Performance tuning (per-connection). The scheduler writes ~1 check + its
  // component/disk/service child rows every tick on this single synchronous
  // connection; without these, each commit fsyncs and blocks the event loop,
  // and reads fall out of the small default cache as the DB grows.
  //   synchronous=NORMAL — safe under WAL (only risks losing the last txn on a
  //     power cut, never corruption); far fewer fsyncs than the FULL default.
  //   cache_size=-65536  — 64 MB page cache (negative = KiB), up from ~2 MB.
  //   mmap_size          — 256 MB memory-mapped reads → fewer syscalls.
  //   temp_store=MEMORY  — sorts/temp b-trees in RAM, not on disk.
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("mmap_size = 268435456");
  sqlite.pragma("temp_store = MEMORY");
  cachedSqlite = sqlite;
  cached = drizzle(sqlite, { schema });
  return cached;
}

/**
 * The raw better-sqlite3 connection, for maintenance ops that don't fit the ORM
 * (PRAGMA reads, VACUUM, WAL checkpoint). Shares the single cached connection.
 */
export function getSqlite(): Sqlite {
  if (!cachedSqlite) getDb();
  return cachedSqlite!;
}

export { schema };
