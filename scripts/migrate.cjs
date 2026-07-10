// Runtime migrator — applies the drizzle-generated SQL in ./drizzle using only
// better-sqlite3 (no drizzle-kit at runtime). Idempotent via a _migrations table.
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function dbFile() {
  const raw = process.env.DATABASE_URL || "./data/apm.db";
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.resolve(stripped);
}

function main() {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER)",
  );

  const dir = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(dir)) {
    console.log("[migrate] no drizzle/ folder — nothing to apply");
    return;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  for (const f of files) {
    const done = db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(f);
    if (done) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        f,
        Date.now(),
      );
    });
    tx();
    applied++;
    console.log(`[migrate] applied ${f}`);
  }
  console.log(`[migrate] up to date (${applied} new, ${files.length} total)`);
  db.close();
}

main();
