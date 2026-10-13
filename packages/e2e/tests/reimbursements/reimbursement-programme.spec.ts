import { expect, test } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement programme", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("picking an event fills the programme from the event", async ({
    page,
  }) => {
    await reimbursements.navigateToNew();
    await reimbursements.form.selectCity("Bangalore");
    const eventInput = page.getByRole("combobox", { name: "Event" });
    await eventInput.click();
    await eventInput.fill("E2E Upcoming Public Bangalore");
    await page
      .getByRole("option")
      .filter({ hasText: "E2E Upcoming Public Bangalore" })
      .first()
      .click();

    await expect(page.getByRole("combobox", { name: "Programme" })).toHaveValue(
      "Unallocated"
    );
  });

  test("the list shows the programme and filters by it", async ({ page }) => {
    test.slow();
    const tag = `Prog${Date.now()}`;
    const education = await reimbursements.createReimbursement(
      `${tag} Edu`,
      "Education"
    );
    await expect(page.getByText("Programme · Education")).toBeVisible();
    const arts = await reimbursements.createReimbursement(
      `${tag} Arts`,
      "Arts and culture"
    );

    await reimbursements.navigateToList();
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(tag);
    const educationRow = reimbursements.list.getRowByText(education);
    const artsRow = reimbursements.list.getRowByText(arts);
    await expect(educationRow).toContainText("Education");
    await expect(artsRow).toContainText("Arts and culture");

    await applyQuickFilter(page, "Programme", "Education");
    await expect(educationRow).toBeVisible();
    await expect(artsRow).toHaveCount(0);
  });
});
