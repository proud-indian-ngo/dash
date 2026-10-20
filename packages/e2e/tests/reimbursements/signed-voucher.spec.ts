import { expect, test } from "../../fixtures/test";
import { ReimbursementPage } from "../../pages/reimbursement-page";

test.describe("Signed cash voucher", () => {
  test("the claimant uploads the signed voucher after approval", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.skip(
      Boolean(process.env.CI),
      "Claiming the uploaded file needs R2, which CI does not have"
    );
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursementWithVoucher("Signed Voucher");
    await reimbursements.approveInDatabase();
    await reimbursements.linkVoucherInDatabase();

    const upload = page.getByRole("button", { name: "Upload signed copy" });
    await expect(upload).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Signed voucher file").setInputFiles({
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
      mimeType: "application/pdf",
      name: "signed-voucher.pdf",
    });

    await expect(page.getByText("Signed voucher uploaded")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Signed copy" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Replace signed copy" })
    ).toBeVisible();
  });
});
