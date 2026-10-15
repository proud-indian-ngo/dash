import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import {
  chargeRequestToProgramme,
  PROGRAMME_EVENT,
} from "../../helpers/request-event";
import { ReimbursementPage } from "../../pages/reimbursement-page";

const execFileAsync = promisify(execFile);

/** Runs a step of `helpers/charged-to.ts` against the test database. */
async function chargedTo(...args: string[]): Promise<{ id: string }> {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/charged-to.ts"),
      ...args,
    ],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as { id: string };
}

test.describe("Reimbursement charged to", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("an event charge shows the event's programme; admin shows Admin", async ({
    page,
  }) => {
    test.slow();
    const tag = `Prog${Date.now()}`;
    const withEvent = await reimbursements.createReimbursement(
      `${tag} Event`,
      PROGRAMME_EVENT
    );
    await expect(
      page.getByText(`Programme · ${PROGRAMME_EVENT.programme}`)
    ).toBeVisible();
    const admin = await reimbursements.createReimbursement(`${tag} Admin`);
    // The header says "Admin", not "Programme · Admin".
    await expect(
      page.getByRole("region", { name: "Charged to" })
    ).toContainText("Organisation (admin)");
    await expect(page.getByText(/Programme ·/)).toHaveCount(0);
    const card = page.getByRole("region", { name: "Charged to" });
    await expect(card).toContainText("Organisation (admin)");

    await reimbursements.navigateToList();
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(tag);
    const eventRow = reimbursements.list.getRowByText(withEvent);
    const adminRow = reimbursements.list.getRowByText(admin);
    await expect(eventRow).toContainText(PROGRAMME_EVENT.programme);
    await expect(adminRow).toContainText("Admin");
    await expect(adminRow).not.toContainText("No event");

    await applyQuickFilter(page, "Programme", "Admin");
    await expect(adminRow).toBeVisible();
    await expect(eventRow).toHaveCount(0);
  });

  test("a claim charged to a programme without an event", async ({ page }) => {
    const title = await reimbursements.createReimbursement(
      `Prog${Date.now()} Centre rent`,
      { programme: "Education" }
    );
    await expect(page.getByText("Programme · Education")).toBeVisible();
    const card = page.getByRole("region", { name: "Charged to" });
    await expect(card).toContainText("Programme");
    await expect(card).toContainText("Education");

    await reimbursements.navigateToList();
    await applyQuickFilter(page, "Programme", "Education");
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(title);
    await expect(reimbursements.list.getRowByText(title)).toContainText(
      "Education"
    );
  });

  test("finance changes it at approval", async ({ page }) => {
    // Nobody re-charges their own request, so a volunteer owns this one.
    const title = `E2E Prog${Date.now()} Change`;
    const { id } = await chargedTo(
      "admin-request",
      title,
      process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test"
    );
    await page.goto(`/reimbursements/${id}`);
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // The header says "Admin", not "Programme · Admin".
    await expect(
      page.getByRole("region", { name: "Charged to" })
    ).toContainText("Organisation (admin)");
    await expect(page.getByText(/Programme ·/)).toHaveCount(0);
    const card = page.getByRole("region", { name: "Charged to" });
    await expect(card).toContainText("Organisation (admin)");

    await card.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Change what this is charged to",
    });
    await expect(dialog).toBeVisible();
    await chargeRequestToProgramme(page, "Arts and culture");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText("Arts and culture");
    await expect(
      page.getByText("Programme · Arts and culture", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Charged to: Organisation (admin) → Programme · Arts and culture"
      )
    ).toBeVisible();

    await page.getByRole("button", { exact: true, name: "Approve" }).click();
    const approve = page.getByRole("alertdialog");
    await expect(approve).toContainText(
      "Charged to: Programme · Arts and culture"
    );
    await approve.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("nobody re-charges their own request", async ({ page }) => {
    await reimbursements.createReimbursement(`Prog${Date.now()} Own`);
    const card = page.getByRole("region", { name: "Charged to" });
    await expect(card).toContainText("Organisation (admin)");
    await expect(card.getByRole("button", { name: "Change" })).toHaveCount(0);
  });

  test("finance finds legacy requests on Unallocated", async ({ page }) => {
    const title = `E2E Legacy Unallocated ${Date.now()}`;
    await chargedTo(
      "legacy-unallocated",
      title,
      process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test"
    );
    await reimbursements.navigateToList();
    await page.getByRole("button", { name: /^Unallocated · \d+$/ }).click();
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(title);
    await expect(reimbursements.list.getRowByText(title)).toContainText(
      "Unallocated"
    );
  });
});
