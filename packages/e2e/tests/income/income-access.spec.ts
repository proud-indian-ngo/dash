import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";

const execFileAsync = promisify(execFile);

test.describe("Income access", () => {
  test("admin without donors.manage sees income but cannot record", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/income");
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { exact: true, name: "Income" })
    ).toBeVisible();
    await page
      .getByPlaceholder("Search donor or reference...")
      .fill("E2E Seed Donor");
    await expect(
      page.getByRole("row").filter({ hasText: "E2E Seed Donor" })
    ).toHaveCount(1, { timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Record contribution" })
    ).toHaveCount(0);
    // finance.view: the menu only leads to Bank statements.
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Bank statements"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: "Imports" })).toBeVisible();
    // finance.view: settlements are visible.
    await expect(page.getByRole("tab", { name: "Settlements" })).toBeVisible();
  });

  test("admin without donors.manage cannot open the importer", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/income/import");
    await expect(page).not.toHaveURL(/\/income\/import/);
  });

  test("a role without donors.view or finance.view is redirected", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/income");
    await expect(page).not.toHaveURL(/\/income/);
    await expect(page.getByRole("link", { name: "Income" })).toHaveCount(0);
  });

  test("finance.view sees the Razorpay sync status but cannot sync or import", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await page.goto("/settings/integrations");
    await waitForZeroReady(page);
    await expect(page.getByTestId("razorpay-last-sync")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Import past payments" })
    ).toHaveCount(0);
  });

  test("a role with donors.view only sees income but not settlements", async ({
    baseURL,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    const { stdout } = await execFileAsync(
      "bun",
      [
        "run",
        path.resolve(import.meta.dirname, "../../helpers/razorpay.ts"),
        "donors-viewer",
      ],
      { env: process.env }
    );
    const viewer = JSON.parse(stdout.trim()) as {
      email: string;
      password: string;
    };
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(viewer.email);
      await page.getByLabel("Password").fill(viewer.password);
      await page.getByRole("button", { exact: true, name: "Log in" }).click();
      await page.waitForURL((url) => url.pathname !== "/login");

      await page.goto("/income?tab=settlements");
      await waitForZeroReady(page);
      await expect(
        page.getByRole("heading", { exact: true, name: "Income" })
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Contributions" })
      ).toBeVisible();
      await expect(page.getByRole("tab", { name: "Settlements" })).toHaveCount(
        0
      );
      // The settlements URL falls back to the contributions tab.
      await expect(
        page.getByRole("tab", { name: "Contributions" })
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("Awaiting settlement")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
