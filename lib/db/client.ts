import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";

let cached: ReturnType<typeof drizzle> | null = null;

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
  cached = drizzle(sqlite, { schema });
  return cached;
}

export { schema };
