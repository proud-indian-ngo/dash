import { expect, test, waitForZeroReady } from "../../fixtures/test";

/** Seeded pending requests raised by the super admin; see seed-test-user. */
const REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000001";
const VENDOR_PAYMENT_ID = "e2e00000-0000-0000-0000-000000000004";

test.describe("Requester contact (users.view)", () => {
  for (const [label, path] of [
    ["reimbursement", `/reimbursements/${REIMBURSEMENT_ID}`],
    ["vendor payment", `/vendor-payments/${VENDOR_PAYMENT_ID}`],
  ] as const) {
    test(`the ${label} page menu emails the requester`, async ({
      page,
      superAdminEmail,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "admin", "Admin-only test");
      await page.goto(path);
      await waitForZeroReady(page);

      await page.getByRole("button", { name: "More actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Email requester" })
      ).toHaveAttribute("href", `mailto:${superAdminEmail}`);
    });
  }
});
