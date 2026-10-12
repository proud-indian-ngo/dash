import { expect, test, waitForZeroReady } from "../../fixtures/test";

const BANK_TIP =
  "Add your bank account once in Settings → Bank accounts, and every claim fills it in for you.";

test.describe("Tip strip", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "volunteer",
      "Tips are per person; one submitting role covers the behaviour"
    );
  });

  test("shows a page tip, opens its link, and stays dismissed after a reload", async ({
    page,
  }) => {
    await page.goto("/reimbursements");
    await waitForZeroReady(page);
    // Start from a clean slate in case this browser state dismissed it before.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("pi-dash:tip-dismissed:")) {
          localStorage.removeItem(key);
        }
      }
    });
    await page.reload();
    await waitForZeroReady(page);

    const tip = page.getByRole("complementary", { name: "Tip" });
    await expect(tip).toContainText(BANK_TIP);

    await tip.getByRole("link", { name: "Open bank accounts" }).click();
    await expect(page).toHaveURL(/\/settings\/bank-accounts$/);
    await expect(
      page.getByRole("heading", { name: "Add a bank account" })
    ).toBeVisible();
    await page.goBack();
    await waitForZeroReady(page);

    await tip.getByRole("button", { name: "Dismiss tip" }).click();
    await expect(tip).toHaveCount(0);

    await page.reload();
    await waitForZeroReady(page);
    await expect(
      page.getByRole("heading", { name: "Reimbursements" })
    ).toBeVisible();
    await expect(tip).toHaveCount(0);

    // Dismissing one page's tip leaves the others alone.
    await page.goto("/events");
    await waitForZeroReady(page);
    await expect(tip).toContainText("Show interest in an event");
  });
});
