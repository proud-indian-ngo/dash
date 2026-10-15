import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { PROGRAMME_EVENT } from "../../helpers/request-event";
import { createVendorPayment } from "../../helpers/vendor-payment";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor payment programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("the list shows what each payment is charged to and filters by it", async ({
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
    const admin = await createVendorPayment(page, `${tag} Admin`);
    await expect(page.getByText("Programme · Admin")).toBeVisible({
      timeout: 10_000,
    });
    const forProgramme = await createVendorPayment(page, `${tag} Programme`, {
      programme: "Community support",
    });
    await expect(page.getByText("Programme · Community support")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/vendor-payments");
    await waitForZeroReady(page);
    const list = new ListPage(page);
    await list.getSearchInput("Search vendor payments...").fill(tag);
    const eventRow = list.getRowByText(withEvent);
    const adminRow = list.getRowByText(admin);
    const programmeRow = list.getRowByText(forProgramme);
    await expect(eventRow).toContainText(PROGRAMME_EVENT.programme);
    await expect(adminRow).toContainText("Admin");
    await expect(programmeRow).toContainText("Community support");

    await applyQuickFilter(page, "Programme", "Admin");
    await expect(adminRow).toBeVisible();
    await expect(eventRow).toHaveCount(0);
    await expect(programmeRow).toHaveCount(0);
  });
});
