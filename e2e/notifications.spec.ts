import { test, expect } from "@playwright/test";

test("create a webhook notification channel", async ({ page }) => {
  const name = `E2E Webhook ${Date.now()}`;

  await page.goto("/settings/notifications");

  // No form exists until the modal opens, and the trigger's onClick only fires
  // once React has hydrated — retry the click until the modal actually appears.
  const openBtn = page.getByRole("button", { name: /set up notification/i });
  await expect(async () => {
    await openBtn.click();
    await expect(page.getByLabel("Notification Type")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  await page.getByLabel("Notification Type").selectOption("webhook");
  await page.getByLabel("Friendly Name").fill(name);
  await page.getByLabel("Webhook URL").fill("https://example.com/hook");
  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByText(name)).toBeVisible();
});
