import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { applyQuickFilter } from "../../helpers/quick-filters";
import { createVendorPayment } from "../../helpers/vendor-payment";
import { ListPage } from "../../pages/list-page";

test.describe("Vendor payment programme (admin)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");
  });

  test("the list shows the programme and filters by it", async ({ page }) => {
    test.slow();
    const tag = `Prog${Date.now()}`;
    const education = await createVendorPayment(
      page,
      `${tag} Edu`,
      "Education"
    );
    await expect(page.getByText("Programme · Education")).toBeVisible({
      timeout: 10_000,
    });
    const arts = await createVendorPayment(
      page,
      `${tag} Arts`,
      "Arts and culture"
    );

    await page.goto("/vendor-payments");
    await waitForZeroReady(page);
    const list = new ListPage(page);
    await list.getSearchInput("Search vendor payments...").fill(tag);
    const educationRow = list.getRowByText(education);
    const artsRow = list.getRowByText(arts);
    await expect(educationRow).toContainText("Education");
    await expect(artsRow).toContainText("Arts and culture");

    await applyQuickFilter(page, "Programme", "Education");
    await expect(educationRow).toBeVisible();
    await expect(artsRow).toHaveCount(0);
  });
});
