import type { Locator } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/** Picks a day in a DateField; its calendar closes itself on selection. */
async function pickDay(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  const popup = page.getByRole("dialog").last();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 24 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  await expect(day).toBeHidden();
}

/**
 * The seeded board (packages/db/src/seed-governance.ts) is read-only for
 * specs: Asha Rao and Vikram Menon in office, Meera Iyer and Rahul Das
 * former. Specs that change the register add their own trustees.
 */

test.describe("trustee register (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("shows who was on the board on a date, with the deed's warnings", async ({
    page,
  }) => {
    await page.goto("/governance");
    await expect(
      page.getByRole("heading", { name: "Trustee register" })
    ).toBeVisible();
    await page.getByLabel("Board on", { exact: true }).fill("2026-04-03");
    const board = page.getByRole("region", { name: /On the board/ });
    await expect(board.getByText("Rahul Das")).toBeVisible();
    await expect(board.getByText("Meera Iyer")).toBeVisible();

    await page.getByLabel("Board on", { exact: true }).fill("2026-10-20");
    await expect(
      page.getByRole("heading", { name: "On the board (2)" })
    ).toBeVisible();
    await expect(board.getByText("Rahul Das")).toBeHidden();
    await expect(
      page.getByText("no meeting can be quorate", { exact: false })
    ).toBeVisible();
    const vikram = board.getByRole("row", { name: /Vikram Menon/ });
    await expect(vikram).toContainText("Joint Managing Trustee");
    await expect(vikram).toContainText("Secretary");

    await page.getByRole("link", { name: "Trust deed" }).click();
    await expect(
      page.getByRole("heading", { name: /Version 1: Trust deed/ })
    ).toBeVisible();
    await expect(page.getByText("Circulars issued by")).toBeVisible();
    await expect(
      page.getByText(
        "5 trustees present and voting, including the Managing Trustee"
      )
    ).toBeVisible();
  });

  test("adds a trustee with a term and an office, and refuses a second holder", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/governance");
    const name = `E2E Trustee ${Date.now()}`;
    await page.getByRole("button", { name: "Add trustee" }).click();
    const dialog = page.getByRole("dialog", { name: "Add trustee" });
    await dialog.getByRole("textbox", { name: "Legal name" }).fill(name);
    await dialog.getByRole("button", { name: "Add trustee" }).click();
    await expect(page.getByText("Trustee added")).toBeVisible();

    // The sheet opens on the new trustee.
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Add term" }).click();
    const termDialog = page.getByRole("dialog", { name: "Add a term" });
    // Next month, so the board in office today stays the seeded two for
    // the circular specs.
    const start = new Date();
    start.setMonth(start.getMonth() + 1, 1);
    await pickDay(termDialog, "Starts on", start);
    await termDialog.getByRole("button", { name: "Add term" }).click();
    await expect(page.getByText("Term added")).toBeVisible();

    await sheet.getByRole("button", { name: "Add office" }).click();
    const officeDialog = page.getByRole("dialog", { name: "Add an office" });
    await officeDialog.getByLabel("Office").click();
    await page.getByRole("option", { exact: true, name: "Treasurer" }).click();
    await pickDay(officeDialog, "Starts on", start);
    await officeDialog.getByRole("button", { name: "Add office" }).click();
    await expect(page.getByText("Office added")).toBeVisible();
    await expect(sheet.getByText("Treasurer")).toBeVisible();

    // Vikram Menon is already Secretary, so a second Secretary is refused.
    await sheet.getByRole("button", { name: "Add office" }).click();
    await officeDialog.getByLabel("Office").click();
    await page.getByRole("option", { exact: true, name: "Secretary" }).click();
    await pickDay(officeDialog, "Starts on", start);
    await officeDialog.getByRole("button", { name: "Add office" }).click();
    await expect(page.getByText(/both hold Secretary/)).toBeVisible();
  });
});

test.describe("trustee register access", () => {
  test("is closed to volunteers", async ({ page, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Trustee register" })
    ).toBeHidden();
    await page.goto("/governance");
    await expect(page).toHaveURL(`${baseURL}/`);
  });

  test("is read-only for finance admins", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    await page.goto("/governance");
    await expect(
      page.getByRole("heading", { name: "Trustee register" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add trustee" })
    ).toBeHidden();
    await page.goto("/governance/registrations");
    await expect(
      page.getByRole("button", { name: "Add registration" })
    ).toBeVisible();
  });
});

test.describe("governance documents (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("adds a PDF to the vault and opens its details", async ({ page }) => {
    test.skip(
      Boolean(process.env.CI),
      "Adding to the vault uploads the file to R2, which CI does not have"
    );
    test.slow();
    await page.goto("/governance/documents");
    await page.getByRole("button", { name: "Add document" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a document" });
    const title = `E2E resolution ${Date.now()}`;
    await dialog.getByLabel("File").setInputFiles({
      // Unique bytes: the vault refuses a file it already holds.
      buffer: Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj\n<<>>\nendobj\n%%EOF`),
      mimeType: "application/pdf",
      name: "resolution.pdf",
    });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await dialog.getByLabel("Kind").click();
    await page.getByRole("option", { exact: true, name: "Resolution" }).click();
    await pickDay(dialog, "Dated", new Date());
    await dialog.getByRole("button", { name: "Add to vault" }).click();
    await expect(page.getByText("Added to the vault")).toBeVisible({
      timeout: 20_000,
    });
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("SHA-256")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Open" })).toBeVisible();
  });
});
