import { readFile } from "node:fs/promises";

import type { Download, Locator, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { clickUntilDialogCloses } from "../../helpers/dialog-submit";
import { clickPageAction } from "../../helpers/page-header";

const RETURN_DONOR = "E2E Return Donor";
const READY_DONOR = "E2E Ready Donor";
/** Seeded encrypted for the ready donor (see seed-test-user.ts). */
const READY_DONOR_PAN = "AAAPE1234E";

/** The financial year running now in India, which holds the seeded gifts. */
function currentFinancialYear(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date());
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

async function openReturn(page: Page) {
  await page.goto(`/income/return?fy=${currentFinancialYear()}`);
  await waitForZeroReady(page);
  await expect(
    page.getByRole("heading", { exact: true, name: "Donations return" })
  ).toBeVisible();
  await expect(page.getByTestId("return-progress")).toBeVisible({
    timeout: 15_000,
  });
}

/** Expands a checklist card and returns its rows. */
async function checkRows(page: Page, id: string): Promise<Locator> {
  const card = page.getByTestId(`return-check-${id}`);
  const trigger = card.getByRole("button").first();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  return card.getByTestId("return-row");
}

async function downloadText(download: Download): Promise<string> {
  const path = await download.path();
  return await readFile(path, "utf8");
}

test.describe("Donations return (finance)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "finance_admin",
      "Needs donors.manage, finance.manage and finance.view_sensitive"
    );
  });

  test("opens from Income and lists the seeded gifts under their checks", async ({
    page,
  }) => {
    await page.goto("/income");
    await waitForZeroReady(page);
    await clickPageAction(page, "Donations return");
    await expect(page).toHaveURL(/\/income\/return/);
    await expect(
      page.getByRole("heading", { exact: true, name: "Donations return" })
    ).toBeVisible();

    await openReturn(page);
    await expect(
      page.getByText(/Form 113 \(formerly 10BD\) for FY \d{4}-\d{2}/)
    ).toBeVisible();
    const ready = page
      .locator("[data-slot='stat-chip']")
      .filter({ hasText: "Ready" })
      .locator("[data-slot='stat-value']");
    await expect(ready).toHaveText(/^[1-9]\d*$/);

    // The seed donor has neither ID nor address; the ready donor has both.
    const missingId = await checkRows(page, "missing_id");
    await expect(missingId.filter({ hasText: "E2E Seed Donor" })).toHaveCount(
      1
    );
    await expect(missingId.filter({ hasText: READY_DONOR })).toHaveCount(0);
    const missingDetails = await checkRows(page, "missing_details");
    await expect(
      missingDetails.filter({ hasText: "E2E Seed Donor" })
    ).toHaveCount(1);
  });

  test("a donor who doesn't want a certificate leaves missing ID but stays under missing address", async ({
    page,
  }) => {
    test.slow();
    await openReturn(page);
    const missingId = await checkRows(page, "missing_id");
    await expect(missingId.filter({ hasText: RETURN_DONOR })).toHaveCount(1);
    const missingDetails = await checkRows(page, "missing_details");
    const detailsRow = missingDetails.filter({ hasText: RETURN_DONOR });
    await expect(detailsRow).toHaveCount(1);

    await detailsRow.getByRole("button", { name: "Open donor" }).click();
    const sheet = page.getByRole("dialog").filter({ hasText: RETURN_DONOR });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Edit" }).click();
    const form = page.getByRole("dialog", { name: "Edit donor" });
    await expect(form).toBeVisible();
    await form
      .getByRole("switch", { name: "Doesn't want a tax certificate (80G)" })
      .click();
    await clickUntilDialogCloses(form, "Save changes");
    await expect(sheet.getByText("No tax certificate")).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(missingId.filter({ hasText: RETURN_DONOR })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(
      (await checkRows(page, "missing_details")).filter({
        hasText: RETURN_DONOR,
      })
    ).toHaveCount(1);
    await expect(
      (await checkRows(page, "excluded")).filter({ hasText: RETURN_DONOR })
    ).toContainText("Donor doesn't want a tax certificate");
  });

  test("sets the 80G registration and exports the CA's file", async ({
    page,
  }) => {
    test.slow();
    await page.goto("/settings/org-accounts");
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Edit 80G registration" }).click();
    await page
      .getByRole("textbox", { name: "Unique Registration Number (URN)" })
      .fill("AAATP1234AF20214");
    await page
      .getByRole("button", { exact: true, name: "Date of issue" })
      .click();
    const calendar = page.getByRole("dialog").last();
    await calendar.locator("button[data-day]").first().click();
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.getByRole("button", { name: "Save registration" }).click();
    await expect(page.getByText("URN AAATP1234AF20214")).toBeVisible({
      timeout: 10_000,
    });

    await openReturn(page);
    // The upload file comes from recording a filing (donation-filings.spec.ts).
    await expect(
      page.getByRole("button", { name: "Record filing" })
    ).toBeEnabled();

    const allPromise = page.waitForEvent("download");
    await clickPageAction(page, "All gifts (for your CA)");
    const all = await allPromise;
    const allText = await downloadText(all);
    expect(allText).toContain(RETURN_DONOR);
    expect(allText).toContain("PAN ending 234E");
    expect(allText).not.toContain(READY_DONOR_PAN);
  });
});

test.describe("Donations return access", () => {
  test("finance.view sees the checklist but cannot export", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");
    await openReturn(page);
    await expect(page.getByTestId("return-check-missing_id")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Record filing" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "More actions" })
    ).toHaveCount(0);
  });

  test("a role without donors or finance access is redirected", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer-only test");
    await page.goto("/income/return");
    await expect(page).not.toHaveURL(/\/income\/return/);
  });
});
