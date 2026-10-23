import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

test.describe("Analytics dashboard (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/analytics");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders stat chips, date range filter and charts", async ({ page }) => {
    await expect(page.locator("[data-slot='stat-chip']").first()).toBeVisible({
      timeout: 10_000,
    });
    // DateRangeFilter renders some UI element for range selection
    await expect(
      page
        .getByRole("button", { name: /This year|Last|Range|Custom/i })
        .first()
        .or(page.locator("[data-slot='select-trigger']").first())
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("region", { name: "Spending by programme" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page
        .getByRole("region", { name: "Spending by category" })
        .or(page.getByRole("region", { name: "Spending over time" }))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("custom date range loads its calendar on desktop and phone", async ({
    page,
  }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ height: 900, width });
      await page.goto("/");
      await waitForZeroReady(page);
      await page.getByRole("combobox").click();
      await page.getByRole("option", { name: "Custom range" }).click();
      const calendar = page.getByRole("grid");
      await expect(calendar).toBeVisible();
      await calendar
        .getByRole("button", { name: /, \w+ 15th, \d{4}$/ })
        .click();
      await calendar
        .getByRole("button", { name: /, \w+ 16th, \d{4}$/ })
        .click();
      await expect
        .poll(() => {
          const params = new URL(page.url()).searchParams;
          const from = params.get("from");
          const to = params.get("to");
          return (
            params.get("range") === "custom" &&
            from !== null &&
            to !== null &&
            Date.parse(to) - Date.parse(from) === 86_400_000
          );
        })
        .toBe(true);
      if (width < 768) {
        await page.getByRole("button", { exact: true, name: "Done" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(calendar).toBeHidden();
    }
  });

  test("spending counts under the expense date, not the submission", async ({
    page,
    superAdminEmail,
  }) => {
    // A day nothing else is dated on, so the range holds only this claim.
    const day = "2001-01-15";
    await execFileAsync(
      "bun",
      [
        "run",
        path.resolve(import.meta.dirname, "../../helpers/charged-to.ts"),
        "expense-dated",
        `E2E Backdated ${Date.now()}`,
        superAdminEmail,
        day,
      ],
      { env: process.env }
    );
    await page.goto(`/analytics?range=custom&from=${day}&to=${day}`);
    await waitForZeroReady(page);
    const total = page
      .locator("[data-slot='stat-chip']")
      .filter({ hasText: "Total" });
    await expect(total.locator("[data-slot='stat-value']")).not.toHaveText(
      "0",
      { timeout: 15_000 }
    );
  });
});
