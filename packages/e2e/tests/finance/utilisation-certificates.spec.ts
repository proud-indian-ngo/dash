import path from "node:path";

import type { Browser, Page } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import { books } from "../../helpers/books-steps";
import {
  catchHelperLink,
  completeHelperJob,
  type TestSigner,
  testSigner,
} from "../../helpers/dsc-helper";

/*
 * A grant's utilisation certificate from preparing to final: finance
 * prepares it, the seeded Managing Trustee (Asha Rao, the super admin) and
 * Joint Managing Trustee (Vikram Menon, the admin) sign it in turn with the
 * DSC helper, played here with this run's test CA, and finance records the
 * CA's certificate. A volunteer can't open it.
 */

const auth = (role: string) =>
  path.resolve(import.meta.dirname, `../../.auth/${role}.json`);

/** Signing asks for the password when the sign-in is older than 10 minutes. */
async function confirmIfAsked(page: Page, password: string) {
  const reauth = page.getByRole("dialog", { name: "Confirm it's you" });
  await reauth
    .waitFor({ state: "visible", timeout: 5000 })
    .then(async () => {
      await reauth.getByLabel("Password").fill(password);
      await reauth.getByRole("button", { name: "Continue" }).click();
    })
    .catch(() => undefined);
}

/** Opens the certificate as the trustee `name`, sets up their DSC if needed and signs. */
async function signAs(
  browser: Browser,
  role: "admin" | "super_admin",
  url: string,
  signer: TestSigner,
  name: string
) {
  const context = await browser.newContext({ storageState: auth(role) });
  const page = await context.newPage();
  const password =
    role === "super_admin"
      ? (process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!")
      : (process.env.ADMIN_PASSWORD ?? "TestAdmin123!");
  try {
    await page.goto(url);
    await waitForZeroReady(page);
    const panel = page.getByRole("region", { name: "Your signature" });
    const signButton = panel.getByRole("button", {
      name: "Sign with your DSC",
    });
    const setUp = panel.getByRole("button", { name: "Set up your DSC" });
    await expect(signButton.or(setUp)).toBeVisible({ timeout: 20_000 });
    if (await setUp.isVisible()) {
      const enrolment = await catchHelperLink(page);
      await setUp.click();
      const enrolled = await completeHelperJob(page, await enrolment(), signer);
      expect(enrolled.status, enrolled.message).toBe(200);
      await expect(signButton).toBeVisible({ timeout: 20_000 });
    }
    const signing = await catchHelperLink(page);
    await signButton.click();
    await confirmIfAsked(page, password);
    const signed = await completeHelperJob(page, await signing(), signer);
    expect(signed.status, signed.message).toBe(200);
    // Signed, the panel goes: it's no longer their turn.
    await expect(
      page
        .getByTestId("certificate-signers")
        .getByRole("listitem")
        .filter({ hasText: name })
    ).toContainText("Signed", { timeout: 20_000 });
    await expect(
      page.getByRole("region", { name: "Your signature" })
    ).toBeHidden();
  } finally {
    await context.close();
  }
}

test.describe("utilisation certificates", () => {
  test("finance prepares, both trustees sign, the CA's certificate makes it final", async ({
    browser,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    const head = testSigner("asha-rao");
    const finance = testSigner("vikram-menon");
    test.skip(
      Boolean(process.env.CI) || !(head && finance),
      "Signing needs R2 and the E2E signing service with its test CA, which CI does not have"
    );
    test.slow();
    if (!(head && finance)) {
      return;
    }
    const fixture = await books<{ grantId: string; title: string }>(
      "certificate-fixture",
      `${Date.now()}`
    );

    // Finance prepares a certificate for the grant up to today.
    await page.goto(`/finance/grants/${fixture.grantId}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "Prepare certificate" }).click();
    const dialog = page.getByRole("dialog", { name: "Prepare certificate" });
    await dialog.getByRole("textbox", { name: "Place" }).fill("Bengaluru");
    const preview = dialog.getByTestId("certificate-preview");
    await expect(preview).toContainText("₹3,000.00", { timeout: 20_000 });
    await expect(preview).toContainText(
      "Signed by Asha Rao, Head of the Organisation (Managing Trustee), then Vikram Menon, Chief Finance Officer (Joint Managing Trustee)."
    );
    await dialog
      .getByRole("button", { exact: true, name: "Prepare certificate" })
      .click();
    await expect(
      page.getByRole("heading", { name: /^Utilisation certificate UC\// })
    ).toBeVisible({ timeout: 30_000 });
    const url = page.url();
    await expect(page.getByText("Waiting for Asha Rao").first()).toBeVisible();

    // The Head of the Organisation signs, then the Chief Finance Officer.
    await signAs(browser, "super_admin", url, head, "Asha Rao");
    await expect(
      page.getByText("Waiting for Vikram Menon").first()
    ).toBeVisible({ timeout: 20_000 });
    await signAs(browser, "admin", url, finance, "Vikram Menon");
    await expect(page.getByText("Waiting for CA").first()).toBeVisible({
      timeout: 20_000,
    });

    // Finance records the CA's UDIN and document.
    await page.getByLabel("UDIN").fill("26123456ABCDEFGHIJ");
    await page.getByLabel("CA's certificate").setInputFiles({
      buffer: Buffer.from("%PDF-1.4\n% E2E CA report\n%%EOF\n"),
      mimeType: "application/pdf",
      name: "ca-report.pdf",
    });
    await page.getByRole("button", { name: "Record CA certificate" }).click();
    await expect(
      page.getByText("CA certificate recorded. The certificate is final.")
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("UDIN 26123456ABCDEFGHIJ")).toBeVisible({
      timeout: 20_000,
    });
    const steps = page.getByTestId("certificate-steps");
    await expect(steps.locator("[data-state='done']")).toHaveCount(5);

    // The grant lists it as final.
    await page.goto(`/finance/grants/${fixture.grantId}`);
    await waitForZeroReady(page);
    await expect(page.getByTestId("utilisation-certificates")).toContainText(
      "Final"
    );
  });

  test("a volunteer who doesn't sign a certificate can't open or download it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    // Straight to the database: no PDF or signing service needed.
    const certificate = await books<{ id: string; number: string }>(
      "certificate-row",
      `${Date.now()}`
    );
    await page.goto(`/finance/grants/certificates/${certificate.id}`);
    await waitForZeroReady(page);
    await expect(
      page.getByText(
        "This certificate doesn't exist, or it isn't yours to see."
      )
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(certificate.number)).toHaveCount(0);
    const download = await page.request.get(
      `/api/utilisation-certificates/${certificate.id}?file=latest`
    );
    expect(download.status()).toBe(403);
  });
});
