import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";
import { chargeRequestTo } from "../../helpers/request-event";
import { ReimbursementPage } from "../../pages/reimbursement-page";

/** Signs across the pad with the mouse: a looping line like handwriting. */
async function drawSignature(page: Page): Promise<void> {
  const pad = page.getByRole("img", { name: /^Signature pad for / });
  await expect(pad).toBeVisible();
  const box = await pad.boundingBox();
  if (!box) {
    throw new Error("The signature pad has no box");
  }
  const at = (fx: number, fy: number) =>
    [box.x + box.width * fx, box.y + box.height * fy] as const;
  await page.mouse.move(...at(0.15, 0.55));
  await page.mouse.down();
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    await page.mouse.move(
      ...at(0.15 + t * 0.6, 0.55 - Math.sin(t * Math.PI * 4) * 0.2),
      { steps: 3 }
    );
  }
  await page.mouse.up();
}

test.describe("Payee signature", () => {
  test("the payee signs on the pad before approval", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursementWithVoucher("Payee Signature");

    await page.getByRole("button", { name: "Collect payee signature" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Collect payee signature",
    });
    await expect(dialog.getByTestId("payee-signature-statement")).toHaveText(
      /^I, Test Payee, received ₹500 from Proud Indian for Small cash expense on \d{1,2} \w{3} \d{4}\.$/
    );
    await expect(
      dialog.getByText(
        "By signing, the payee confirms they received this amount."
      )
    ).toBeVisible();

    // Nothing drawn yet: the button waits.
    const waiting = dialog.getByRole("button", {
      name: "Waiting for signature",
    });
    await expect(waiting).toBeDisabled();

    await drawSignature(page);
    const confirm = dialog.getByRole("button", { name: "Confirm signature" });
    await expect(confirm).toBeEnabled();

    // Undo takes the stroke away; Clear empties the pad.
    await dialog.getByRole("button", { name: "Undo" }).click();
    await expect(waiting).toBeDisabled();
    await drawSignature(page);
    await dialog.getByRole("button", { name: "Clear" }).click();
    await expect(waiting).toBeDisabled();

    await drawSignature(page);
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByText("Signature saved")).toBeVisible({
      timeout: 15_000,
    });
    const chip = page.getByTestId("payee-signature-chip");
    await expect(chip).toContainText(/Signed by Test Payee · \d{1,2} \w{3}/);
    const thumbnail = chip.getByRole("img", {
      name: "Signature of Test Payee",
    });
    await expect(thumbnail).toBeVisible();
    // The thumbnail loads the stored PNG, retrying if it showed before the
    // server had stored it.
    await expect
      .poll(
        () =>
          thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth),
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0);
    await expect(
      chip.getByRole("button", { name: "Re-collect" })
    ).toBeVisible();

    // The thumbnail opens the signature in the viewer.
    await thumbnail.click();
    const viewer = page.getByRole("dialog", {
      name: "Signature of Test Payee",
    });
    await expect(
      viewer.getByRole("img", { name: "Signature of Test Payee" })
    ).toBeVisible({ timeout: 15_000 });
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(viewer).toBeHidden();
  });

  test("the voucher prints the payee's signature", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursementWithVoucher("Signed Voucher PDF");
    await page.getByRole("button", { name: "Collect payee signature" }).click();
    await drawSignature(page);
    await page.getByRole("button", { name: "Confirm signature" }).click();
    await expect(page.getByText("Signature saved")).toBeVisible({
      timeout: 15_000,
    });

    // Approval queues the real voucher job; run it as approval would.
    await reimbursements.approveInDatabase();
    await reimbursements.generateVoucherInDatabase();

    const thumbnail = page
      .getByTestId("payee-signature-chip")
      .getByRole("img", { name: "Signature of Test Payee" });
    const png = await page.request.get(
      (await thumbnail.getAttribute("src")) ?? ""
    );
    const header = Buffer.from(await png.body());
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);

    // The voucher opens in the viewer, rendered page by page.
    await page
      .getByRole("button", { name: "View voucher" })
      .click({ timeout: 15_000 });
    const viewer = page.getByRole("dialog").filter({
      has: page.getByRole("button", { name: "Download" }),
    });
    await expect(viewer.getByRole("group", { name: "Page 1" })).toBeVisible({
      timeout: 15_000,
    });
    const pdf = await page.request.get(
      (await viewer
        .getByRole("link", { name: "Open in new tab" })
        .getAttribute("href")) ?? ""
    );
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    // The PDF embeds an image the signature's size beside the treasurer's.
    const images = [
      ...Buffer.from(await pdf.body())
        .toString("latin1")
        .matchAll(/\/Subtype \/Image([^>]*)/g),
    ].map((match) => {
      const dict = match[1] ?? "";
      return {
        height: Number(/\/Height (\d+)/.exec(dict)?.[1]),
        width: Number(/\/Width (\d+)/.exec(dict)?.[1]),
      };
    });
    expect(images).toContainEqual({ height, width });
  });

  test("an item paid to the claimant needs no payee signature", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    const title = `E2E Payee Signature Claimant ${Date.now()}`;
    await reimbursements.navigateToNew();
    await reimbursements.form.selectBankAccount();
    await reimbursements.form.fillTitle(title);
    await reimbursements.form.selectCity("Bangalore");
    await chargeRequestTo(page, "Organisation (admin)");
    await reimbursements.selectExpenseDate();
    await reimbursements.form.fillLineItem({
      amount: "400",
      description: "Auto fare paid in cash",
    });
    await reimbursements.form.toggleCashVoucher(0);
    await reimbursements.form.togglePayeeIsClaimant(0);
    await reimbursements.form.submit();
    await reimbursements.waitForDetail(title);

    await expect(
      page.getByText("No payee signature needed: the claimant was paid")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Collect payee signature" })
    ).toHaveCount(0);
  });
});

test.describe("Payee signature on a phone", () => {
  test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });

  test("signs in a full-screen sheet", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursementWithVoucher(
      "Payee Signature Phone"
    );

    await page.getByRole("button", { name: "Collect payee signature" }).click();
    const sheet = page.getByRole("dialog", { name: "Collect payee signature" });
    await expect(sheet.getByTestId("payee-signature-statement")).toBeVisible();
    await drawSignature(page);
    // The stroke drew on the pad rather than dragging the sheet closed.
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Confirm signature" })
    ).toBeEnabled();
  });
});

test.describe("Payee signature on a phone on its side", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 390, width: 844 },
  });

  test("puts the pad beside the statement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Claimant-only test");
    test.slow();

    const reimbursements = new ReimbursementPage(page, "reimbursement");
    await reimbursements.createReimbursementWithVoucher(
      "Payee Signature Landscape"
    );

    await page.getByRole("button", { name: "Collect payee signature" }).click();
    const sheet = page.getByRole("dialog", { name: "Collect payee signature" });
    const statement = sheet.getByTestId("payee-signature-statement");
    const pad = page.getByRole("img", { name: /^Signature pad for / });
    await expect(statement).toBeVisible();
    await expect(pad).toBeInViewport({ ratio: 1 });
    const [statementBox, padBox] = await Promise.all([
      statement.boundingBox(),
      pad.boundingBox(),
    ]);
    expect(padBox?.x ?? 0).toBeGreaterThan(
      (statementBox?.x ?? 0) + (statementBox?.width ?? 0) - 1
    );
    await drawSignature(page);
    const confirm = sheet.getByRole("button", { name: "Confirm signature" });
    await expect(confirm).toBeInViewport();
    await expect(confirm).toBeEnabled();
  });
});
