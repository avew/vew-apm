import { test as setup, expect } from "@playwright/test";
import path from "node:path";

export const AUTH_FILE = path.join(__dirname, ".auth/user.json");
export const USER = "admin";
export const PASS = "e2e-password-123";

// Authenticate via the API (not the form) so the session is deterministic and
// independent of client hydration timing. Fresh DB → /api/auth/setup creates the
// admin; if already set up it 409s (ignored) and the login below still works.
// The request context's cookie jar is saved as storage state for the browser
// specs to reuse.
setup("authenticate", async ({ request }) => {
  await request.post("/api/auth/setup", {
    data: { username: USER, password: PASS },
  });
  const login = await request.post("/api/auth/login", {
    data: { username: USER, password: PASS },
  });
  expect(login.ok()).toBeTruthy();
  await request.storageState({ path: AUTH_FILE });
});
