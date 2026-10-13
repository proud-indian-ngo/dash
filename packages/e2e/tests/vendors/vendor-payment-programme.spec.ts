import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { PROGRAMME_EVENT } from "../../helpers/request-event";
import { createVendorPayment } from "../../helpers/vendor-payment";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor payment programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("the list shows the event's programme and filters by it", async ({
    page,
  }) => {
    test.slow();
    const tag = `Prog${Date.now()}`;
    const withEvent = await createVendorPayment(
      page,
      `${tag} Event`,
      PROGRAMME_EVENT
    );
    await expect(
      page.getByText(`Programme · ${PROGRAMME_EVENT.programme}`)
    ).toBeVisible({ timeout: 10_000 });
    const withoutEvent = await createVendorPayment(page, `${tag} None`);

    await page.goto("/vendor-payments");
    await waitForZeroReady(page);
    const list = new ListPage(page);
    await list.getSearchInput("Search vendor payments...").fill(tag);
    const eventRow = list.getRowByText(withEvent);
    const noEventRow = list.getRowByText(withoutEvent);
    await expect(eventRow).toContainText(PROGRAMME_EVENT.programme);
    await expect(noEventRow).toContainText("No event");

    await applyQuickFilter(page, "Programme", "No event");
    await expect(noEventRow).toBeVisible();
    await expect(eventRow).toHaveCount(0);
  });
});
