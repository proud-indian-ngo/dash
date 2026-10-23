import type { Locator, Page } from "@playwright/test";

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
    const row = (name: string) =>
      page.getByRole("row", { name: new RegExp(name) });
    await page.goto("/governance?on=2026-04-03");
    await expect(row("Rahul Das")).toContainText("On the board");
    await expect(row("Meera Iyer")).toContainText("On the board");

    await page.goto("/governance?on=2026-10-20");
    await expect(row("Rahul Das")).toContainText("Not on the board");
    await expect(row("Vikram Menon")).toContainText("Joint Managing Trustee");
    await expect(row("Vikram Menon")).toContainText("Secretary");

    // Before version 2 of the deed (1 Jan 2026), a quorum of five can't be
    // met by the four trustees then in office.
    await page.goto("/governance?on=2025-12-31");
    await expect(
      page.getByText("no meeting can be quorate", { exact: false })
    ).toBeVisible();

    await page.getByRole("link", { name: "Trust deed" }).click();
    const inForce = page.getByRole("region", { name: "Rules in force" });
    await expect(inForce.getByText("Circulars issued by")).toBeVisible();
    // Version 2 lists only what it changed: version 1's quorum, struck out.
    const version2 = page
      .getByRole("region", { name: "History" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: /^Version 2:/ }) });
    await expect(
      version2.getByText(
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

  test("deletes a trustee added by mistake only once nothing refers to them", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/governance");
    const name = `E2E Mistaken trustee ${Date.now()}`;
    await page.getByRole("button", { name: "Add trustee" }).click();
    const dialog = page.getByRole("dialog", { name: "Add trustee" });
    await dialog.getByRole("textbox", { name: "Legal name" }).fill(name);
    await dialog.getByRole("button", { name: "Add trustee" }).click();
    const sheet = page.getByRole("dialog", { name });
    await sheet.getByRole("button", { name: "Add term" }).click();
    const termDialog = page.getByRole("dialog", { name: "Add a term" });
    const start = new Date();
    start.setMonth(start.getMonth() + 1, 1);
    await pickDay(termDialog, "Starts on", start);
    await termDialog.getByRole("button", { name: "Add term" }).click();
    await expect(page.getByText("Term added")).toBeVisible();

    const deleteTrustee = async () => {
      await sheet.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Delete trustee" }).click();
      await page
        .getByRole("alertdialog", { name: "Delete this record?" })
        .getByRole("button", { name: "Delete trustee" })
        .click();
    };
    // A term refers to them, so the trustee stays.
    await deleteTrustee();
    await expect(page.getByText(/so they can't be deleted/)).toBeVisible();
    // A refused delete leaves the confirmation open.
    await page
      .getByRole("alertdialog", { name: "Delete this record?" })
      .getByRole("button", { name: "Cancel" })
      .click();

    await sheet.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this record?" })
      .getByRole("button", { name: "Delete term" })
      .click();
    await expect(page.getByText("Deleted", { exact: true })).toBeVisible();

    await deleteTrustee();
    await expect(page.getByText("Trustee deleted")).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
      0
    );
  });

  test("adds a registration, then deletes it", async ({ page }) => {
    await page.goto("/governance/registrations");
    const number = `E2E${Date.now()}`;
    await page.getByRole("button", { name: "Add registration" }).click();
    const dialog = page.getByRole("dialog", { name: "Add registration" });
    await dialog.getByRole("textbox", { name: "Number" }).fill(number);
    await dialog.getByRole("button", { name: "Add registration" }).click();
    await expect(page.getByText("Registration added")).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(number) });
    await row.getByRole("button", { name: /actions/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this registration?" })
      .getByRole("button", { name: "Delete registration" })
      .click();
    await expect(page.getByText("Registration deleted")).toBeVisible();
    await expect(row).toHaveCount(0);
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

  test("lets finance admins manage the register", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    await page.goto("/governance");
    await expect(
      page.getByRole("heading", { name: "Trustee register" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add trustee" })
    ).toBeVisible();
    await page.goto("/governance/registrations");
    await expect(
      page.getByRole("button", { name: "Add registration" })
    ).toBeVisible();
  });
});

/** Adds a unique PDF to the vault; the page then opens its details sheet. */
async function addPdf(page: Page, title: string) {
  await page.goto("/governance/documents");
  await page.getByRole("button", { name: "Add document" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a document" });
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
}

test.describe("governance documents (super admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("adds a PDF to the vault and opens its details", async ({ page }) => {
    test.slow();
    const title = `E2E resolution ${Date.now()}`;
    await addPdf(page, title);
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("SHA-256")).toBeVisible();
    await sheet.getByRole("button", { name: "View" }).click();
    const viewer = page.getByRole("dialog", { name: title }).last();
    await expect(
      viewer.getByRole("link", { name: "Open in new tab" })
    ).toHaveAttribute("href", /kind=governanceDocument/);
  });

  test("edits a document's details, then deletes it", async ({ page }) => {
    test.slow();
    const title = `E2E mistake ${Date.now()}`;
    await addPdf(page, title);
    const sheet = page.getByRole("dialog", { name: title });
    await sheet.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Edit details" }).click();
    const edit = page.getByRole("dialog", { name: "Edit details" });
    const renamed = `${title} (renamed)`;
    await edit.getByRole("textbox", { name: "Title" }).fill(renamed);
    await edit.getByRole("textbox", { name: "Note" }).fill("Wrong file");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Details saved")).toBeVisible();
    const renamedSheet = page.getByRole("dialog", { name: renamed });
    await expect(renamedSheet.getByText("Wrong file")).toBeVisible();

    await renamedSheet.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { exact: true, name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this document?" })
      .getByRole("button", { name: "Delete document" })
      .click();
    await expect(page.getByText("Document deleted")).toBeVisible();
    await expect(renamedSheet).toBeHidden();
    await expect(page.getByRole("row", { name: renamed })).toHaveCount(0);
  });
});
