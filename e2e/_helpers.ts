import { type Page } from "@playwright/test";

/**
 * Wait until React has hydrated the form on the page. Under `next dev` the HTML
 * arrives before the client JS runs; clicking a submit button before hydration
 * triggers a native form submit (page reload) instead of the client onSubmit.
 * React tags hydrated DOM nodes with `__react…` properties — wait for one on a
 * form control, after which fills stick and the submit is handled client-side.
 */
export async function waitForHydration(page: Page, selector = "form, form input, form button") {
  await page.waitForFunction(
    (sel) => {
      for (const el of document.querySelectorAll(sel)) {
        if (Object.keys(el).some((k) => k.startsWith("__react"))) return true;
      }
      return false;
    },
    selector,
    { timeout: 30_000 },
  );
}
