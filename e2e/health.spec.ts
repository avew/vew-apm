import { test, expect } from "@playwright/test";

// Public, no-auth liveness endpoint that drives the Docker HEALTHCHECK.
test("GET /api/health reports liveness", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty("status");
});
