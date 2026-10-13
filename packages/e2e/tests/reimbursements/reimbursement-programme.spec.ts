import { expect, test } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { PROGRAMME_EVENT } from "../../helpers/request-event";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Reimbursement programme", () => {
  let reimbursements: ReimbursementPage;

  test.beforeEach(({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
    reimbursements = new ReimbursementPage(page, "reimbursement");
  });

  test("the list shows the event's programme and filters by it", async ({
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
    const withoutEvent = await reimbursements.createReimbursement(
      `${tag} None`
    );
    await expect(page.getByText(/Programme ·/)).toHaveCount(0);

    await reimbursements.navigateToList();
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(tag);
    const eventRow = reimbursements.list.getRowByText(withEvent);
    const noEventRow = reimbursements.list.getRowByText(withoutEvent);
    await expect(eventRow).toContainText(PROGRAMME_EVENT.programme);
    await expect(noEventRow).toContainText("No event");

    await applyQuickFilter(page, "Programme", PROGRAMME_EVENT.programme);
    await expect(eventRow).toBeVisible();
    await expect(noEventRow).toHaveCount(0);
  });

  test("the programme filter finds requests without an event", async ({
    page,
  }) => {
    const title = await reimbursements.createReimbursement(
      `Prog${Date.now()} None`
    );
    await reimbursements.navigateToList();
    await applyQuickFilter(page, "Programme", "No event");
    await reimbursements.list
      .getSearchInput("Search reimbursements...")
      .fill(title);
    await expect(reimbursements.list.getRowByText(title)).toContainText(
      "No event"
    );
  });
});
