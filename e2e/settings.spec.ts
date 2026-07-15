import { test, expect } from "@playwright/test";

// Each settings tab renders (SSR headings — no hydration needed).
const TABS: { path: string; heading: RegExp }[] = [
  { path: "/settings/alerts", heading: /Alert thresholds/ },
  { path: "/settings/notifications", heading: /Notification channels/ },
  { path: "/settings/maintenance", heading: /Maintenance windows/ },
  { path: "/settings/status", heading: /Public status page/ },
  { path: "/settings/data", heading: /Data & storage/ },
];

for (const { path, heading } of TABS) {
  test(`settings tab ${path} renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}

test("settings sub-nav links between tabs", async ({ page }) => {
  await page.goto("/settings/alerts");
  await page.getByRole("link", { name: /notifications/i }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  await expect(
    page.getByRole("heading", { name: /Notification channels/ }),
  ).toBeVisible();
});
