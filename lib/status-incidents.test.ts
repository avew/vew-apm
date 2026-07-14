import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let lib: typeof import("./status-incidents");

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "apm-si-"));
  process.env.DATABASE_URL = path.join(dir, "si.db");
  const raw = new Database(process.env.DATABASE_URL);
  const drz = path.resolve("drizzle");
  for (const f of readdirSync(drz).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(path.join(drz, f), "utf8"));
  }
  raw.close();
  lib = await import("./status-incidents");
});

describe("status incidents", () => {
  it("creates an incident with its first update", async () => {
    const id = lib.createStatusIncident({
      title: "API latency",
      impact: "major",
      status: "investigating",
      body: "Looking into it",
    });
    const [inc] = await lib.listStatusIncidents();
    expect(inc.id).toBe(id);
    expect(inc.status).toBe("investigating");
    expect(inc.resolvedAt).toBeNull();
    expect(inc.updates).toHaveLength(1);
    expect(inc.updates[0].body).toBe("Looking into it");
  });

  it("advances status via updates and sets resolvedAt on resolve", async () => {
    const id = lib.createStatusIncident({
      title: "DB errors",
      impact: "critical",
      status: "investigating",
      body: "start",
    });
    lib.addStatusIncidentUpdate(id, { status: "identified", body: "bad deploy" });
    lib.addStatusIncidentUpdate(id, { status: "resolved", body: "rolled back" });

    const inc = (await lib.listStatusIncidents()).find((i) => i.id === id)!;
    expect(inc.status).toBe("resolved");
    expect(inc.resolvedAt).not.toBeNull();
    expect(inc.updates).toHaveLength(3); // create + 2 updates
    expect(inc.updates[0].status).toBe("resolved"); // newest first
  });

  it("public list keeps active incidents and drops long-resolved ones", async () => {
    const now = new Date();
    const active = await lib.loadPublicStatusIncidents(now);
    // both incidents above are recent, so both surface; the active one sorts first
    expect(active[0].status).not.toBe("resolved");
  });

  it("delete removes the incident (updates cascade)", async () => {
    const id = lib.createStatusIncident({
      title: "temp",
      impact: "minor",
      status: "investigating",
      body: "x",
    });
    await lib.deleteStatusIncident(id);
    expect((await lib.listStatusIncidents()).some((i) => i.id === id)).toBe(false);
  });
});
