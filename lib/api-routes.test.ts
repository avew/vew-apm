import { describe, it, expect, beforeAll, vi } from "vitest";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Gated routes call requireUser() which needs a request scope (next/headers
// cookies) — stub it to an authenticated admin so we can exercise route logic.
vi.mock("@/lib/session", () => ({
  requireUser: vi.fn(async () => ({ sub: "admin", epoch: 0 })),
  getCurrentUser: vi.fn(async () => ({ sub: "admin", epoch: 0 })),
}));

type Handler = (req: Request) => Promise<Response>;
let loginPOST: Handler;
let setupPOST: Handler;
let notifPOST: Handler;
let alertPATCH: Handler;
let statusPATCH: Handler;
let loadAlertSettings: typeof import("@/lib/alerts").loadAlertSettings;
let loadStatusPageSettings: typeof import("@/lib/status").loadStatusPageSettings;
let getDb: typeof import("@/lib/db/client").getDb;
let schema: typeof import("@/lib/db/client").schema;
let isEncrypted: typeof import("@/lib/crypto").isEncrypted;
let decryptSecret: typeof import("@/lib/crypto").decryptSecret;
let notifPatch: (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ADMIN = { username: "admin", password: "password123" };

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "apm-api-"));
  process.env.DATABASE_URL = path.join(dir, "api.db");
  process.env.SESSION_SECRET = "test-session-secret-test-session-secret";
  process.env.ENCRYPTION_KEY = "api-test-key";

  const raw = new Database(process.env.DATABASE_URL);
  const drz = path.resolve("drizzle");
  for (const f of readdirSync(drz).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(path.join(drz, f), "utf8"));
  }
  raw.close();

  ({ POST: loginPOST } = await import("@/app/api/auth/login/route"));
  ({ POST: setupPOST } = await import("@/app/api/auth/setup/route"));
  ({ POST: notifPOST } = await import("@/app/api/notifications/route"));
  ({ PATCH: alertPATCH } = await import("@/app/api/alert-settings/route"));
  ({ PATCH: statusPATCH } = await import("@/app/api/status-page/route"));
  ({ loadAlertSettings } = await import("@/lib/alerts"));
  ({ loadStatusPageSettings } = await import("@/lib/status"));
  ({ getDb, schema } = await import("@/lib/db/client"));
  ({ isEncrypted, decryptSecret } = await import("@/lib/crypto"));
  ({ PATCH: notifPatch } = await import("@/app/api/notifications/[id]/route"));

  const { createInitialAdmin } = await import("@/lib/auth");
  await createInitialAdmin(ADMIN.username, ADMIN.password);
});

describe("POST /api/auth/login", () => {
  it("rejects wrong credentials with 401", async () => {
    const res = await loginPOST(
      jsonReq("http://t/api/auth/login", { username: "nope", password: "bad" }, {
        "x-forwarded-for": "10.0.0.1",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("sets a session cookie on valid credentials", async () => {
    const res = await loginPOST(
      jsonReq("http://t/api/auth/login", ADMIN, { "x-forwarded-for": "10.0.0.2" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("apm_session");
  });

  it("locks out after repeated failures (429)", async () => {
    const req = () =>
      jsonReq(
        "http://t/api/auth/login",
        { username: "bruteforce", password: "x" },
        { "x-forwarded-for": "10.0.0.9" },
      );
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await loginPOST(req())).status;
    expect(last).toBe(429);
  });
});

describe("POST /api/auth/setup", () => {
  it("returns 409 once an admin already exists", async () => {
    const res = await setupPOST(
      jsonReq("http://t/api/auth/setup", { username: "x", password: "password123" }),
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/notifications", () => {
  it("rejects invalid input with 400", async () => {
    const res = await notifPOST(
      jsonReq("http://t/api/notifications", { kind: "telegram", name: "", config: {} }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a channel and stores its config encrypted", async () => {
    const res = await notifPOST(
      jsonReq("http://t/api/notifications", {
        kind: "telegram",
        name: "tg",
        config: { botToken: "123:SECRET", chatId: -100 },
      }),
    );
    expect(res.status).toBe(201);
    const rows = await getDb().select().from(schema.notificationChannels);
    const row = rows.find((r) => r.name === "tg")!;
    expect(row).toBeTruthy();
    expect(isEncrypted(row.config)).toBe(true); // never plaintext at rest
    expect(JSON.stringify(row.config)).not.toContain("SECRET");
  });
});

describe("PATCH /api/alert-settings", () => {
  it("persists a threshold change", async () => {
    const res = await alertPATCH(
      jsonReq("http://t/api/alert-settings", { renotifyMinutes: 45 }),
    );
    expect(res.status).toBe(200);
    expect((await loadAlertSettings()).renotifyMinutes).toBe(45);
  });
});

describe("PATCH /api/status-page", () => {
  it("enables the status page and sets the title", async () => {
    const res = await statusPATCH(
      jsonReq("http://t/api/status-page", { enabled: true, title: "Ops Status" }),
    );
    expect(res.status).toBe(200);
    const s = await loadStatusPageSettings();
    expect(s.enabled).toBe(true);
    expect(s.title).toBe("Ops Status");
  });
});

describe("PATCH /api/notifications/[id] — config merge", () => {
  it("keeps the secret when the edit omits it, updates other fields", async () => {
    // create a telegram channel with a secret token
    const created = await notifPOST(
      jsonReq("http://t/api/notifications", {
        kind: "telegram",
        name: "tg-edit",
        config: { botToken: "123:SECRET", chatId: -100 },
      }),
    );
    const { channel } = await created.json();
    const id = channel.id as number;

    // edit: change chatId only, no botToken (as the masked edit form does)
    const res = await notifPatch(
      new Request(`http://t/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "tg-edit-2", config: { chatId: -999 } }),
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(schema.notificationChannels)
      .where(eq(schema.notificationChannels.id, id));
    expect(row.name).toBe("tg-edit-2");
    const cfg = decryptSecret<Record<string, unknown>>(row.config);
    expect(cfg.botToken).toBe("123:SECRET"); // preserved
    expect(cfg.chatId).toBe(-999); // updated
  });
});
