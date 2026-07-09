import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const raw = process.env.DATABASE_URL ?? "./data/apm.db";
const file = raw.startsWith("file:") ? raw.slice(5) : raw;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: file },
});
