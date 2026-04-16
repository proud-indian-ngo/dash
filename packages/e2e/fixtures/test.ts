import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../.env.test"),
  quiet: true,
});

/**
 * Wait for Zero to be ready for assertions on query-backed UI.
 *
 * Two-phase:
 *   1. `#main[data-zero-ready]` — WebSocket connected (set in `_app.tsx`).
 *   2. Any visible skeleton loaders have unmounted — most pages render
 *      `<Skeleton data-slot="skeleton" />` while initial Zero queries are
 *      still `result.type === "unknown"`. Their disappearance is a strong
 *      signal that primary queries have hydrated.
 *
 * The skeleton wait is best-effort. Pages that don't use skeletons (e.g.
 * the reimbursement form) return immediately; pages with persistent
 * skeletons (lazy sections) don't block the caller beyond `skeletonTimeout`.
 */
export async function waitForZeroReady(
  page: Page,
  timeout = 30_000,
  skeletonTimeout = 10_000
) {
  await page.locator("#main[data-zero-ready]").waitFor({ timeout });

  // Give skeletons a tick to mount if they will at all. Without this, a very
  // fast first render can beat us and we'd skip the check prematurely.
  await page.waitForTimeout(50);

  if ((await page.locator('[data-slot="skeleton"]').count()) === 0) {
    return;
  }

  await page
    .waitForFunction(
      () => document.querySelectorAll('[data-slot="skeleton"]').length === 0,
      undefined,
      { timeout: skeletonTimeout }
    )
    .catch(() => {
      // Persistent skeleton in non-critical region — don't block the test.
    });
}

export const test = base.extend<{
  superAdminEmail: string;
  adminEmail: string;
  financeAdminEmail: string;
  volunteerEmail: string;
  unorientedVolunteerEmail: string;
  consoleErrors: Error[];
}>({
  superAdminEmail:
    process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test",
  adminEmail: process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
  financeAdminEmail:
    process.env.FINANCE_ADMIN_EMAIL ?? "test-finance-admin@pi-dash.test",
  volunteerEmail: process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test",
  unorientedVolunteerEmail:
    process.env.UNORIENTED_VOLUNTEER_EMAIL ??
    "test-unoriented-volunteer@pi-dash.test",
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: Error[] = [];
      page.on("pageerror", (error) => errors.push(error));
      await use(errors);
      if (errors.length > 0) {
        for (const error of errors) {
          testInfo.annotations.push({
            type: "browser-error",
            description: error.message,
          });
        }
        // Uncomment the line below to promote to hard failure:
        // expect(errors, "Uncaught browser errors detected").toHaveLength(0);
      }
    },
    { auto: true },
  ],
});

export { expect };
