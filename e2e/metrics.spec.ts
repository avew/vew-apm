import { test, expect } from "@playwright/test";

// Add a Prometheus metric endpoint + rule to an ordinary (actuator) monitor via
// the detail-page Metrics section, and see them render. The scheduler is disabled
// in E2E, so nothing is scraped — this exercises the sources/rules UI + CRUD.
test("add a metric endpoint and rule to an actuator monitor", async ({ page }) => {
  // Create the monitor via the API (shares the authenticated session cookie).
  const res = await page.request.post("/api/monitors", {
    data: {
      name: `Metrics E2E ${Date.now()}`,
      url: "http://svc.local/actuator/health",
      type: "actuator",
    },
  });
  expect(res.ok()).toBeTruthy();
  const { monitor } = await res.json();

  await page.goto(`/monitors/${monitor.id}`);
  await expect(
    page.getByRole("heading", { name: /Prometheus metrics/i }),
  ).toBeVisible();

  // Add an endpoint (retry the click through React hydration).
  const addEndpoint = page.getByRole("button", { name: /add endpoint/i });
  await expect(async () => {
    await addEndpoint.click();
    await expect(page.getByPlaceholder("billing-svc")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await page.getByPlaceholder("billing-svc").fill("billing");
  await page.getByPlaceholder(/actuator\/prometheus/).fill("http://billing.local/actuator/prometheus");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("http://billing.local/actuator/prometheus")).toBeVisible();

  // Add a rule targeting that endpoint.
  const addRule = page.getByRole("button", { name: /add rule/i });
  await expect(async () => {
    await addRule.click();
    await expect(page.getByPlaceholder("jvm_memory_used_bytes")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("Endpoint (source)").selectOption({ label: "billing" });
  await page.getByPlaceholder("Heap memory").fill("heap used");
  await page.getByPlaceholder("jvm_memory_used_bytes").fill("jvm_memory_used_bytes");
  await page.getByLabel("Warn at").fill("1000000000");
  await page.getByRole("button", { name: /save rule/i }).click();

  // The rule renders with its label and source badge.
  await expect(page.getByText("heap used")).toBeVisible();
  await expect(page.getByText("No samples yet.")).toBeVisible();
});
