import { test, expect } from "@playwright/test";
import { waitForHydration } from "./_helpers";

test("alert threshold change persists", async ({ page }) => {
  await page.goto("/settings/alerts");
  await waitForHydration(page);

  // Disk "Warning at ≥ (%)" — scope to the Disk usage fieldset to disambiguate.
  const diskWarn = page
    .locator("fieldset", { hasText: "Disk usage" })
    .getByLabel(/warning at/i);

  await diskWarn.fill("55");
  await page.getByRole("button", { name: /save thresholds/i }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Reload and confirm the value round-tripped through the DB.
  await page.reload();
  await expect(diskWarn).toHaveValue("55");
});
