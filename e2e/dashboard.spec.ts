import { test, expect } from "@playwright/test";

test("dashboard renders for an authenticated user", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Monitors" })).toBeVisible();
  await expect(page.getByRole("link", { name: /new monitor/i })).toBeVisible();
});

test("redirects to /login when signed out", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
