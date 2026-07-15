import { test, expect } from "@playwright/test";
import { waitForHydration } from "./_helpers";

test("create a monitor and see it on the dashboard", async ({ page }) => {
  const name = `E2E Monitor ${Date.now()}`;

  await page.goto("/monitors/new");
  // Wait for React to hydrate the form, else the click does a native submit.
  await waitForHydration(page);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Health URL").fill("http://127.0.0.1:4100/health");
  await page.getByRole("button", { name: /create monitor/i }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByText(name)).toBeVisible();
});
