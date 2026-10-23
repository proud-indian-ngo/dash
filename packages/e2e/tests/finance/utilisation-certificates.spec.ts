import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

import type { Browser, Locator, Page, TestInfo } from "@playwright/test";

import { expect, test, waitForZeroReady } from "../../fixtures/test";
import {
  catchHelperLink,
  completeHelperJob,
  type TestSigner,
  testSigner,
} from "../../helpers/dsc-helper";
import {
  fixture,
  newCertificate,
  newGrant,
  openGrant,
  openPrepare,
} from "../../helpers/utilisation-certificate-steps";
import { ListPage } from "../../pages/list-page";

/*
 * Utilisation certificates for a grant. The seeded Managing Trustee (Asha
 * Rao, the super admin) signs as Head of the Organisation and the Joint
 * Managing Trustee (Vikram Menon, the admin) as Chief Finance Officer.
 *
 * Certificates these tests don't prepare through the UI are written straight
 * to the database (`helpers/utilisation-certificates.ts`). The signing flow
 * needs the E2E signing service with this run's test CA and the fake R2,
 * which run-e2e.sh and CI both start, and fails without them. The CSR-1
 * check, which hides the trust's registration, is in
 * `utilisation-certificate-csr1.spec.ts` and runs last, alone.
 *
 * Artifacts, attached to the report and kept in the test's output dir:
 * - `certificate-preview.json`: the figures the prepare dialog showed for
 *   the fixture grant, as displayed. The same on every run.
 * - `utilisation-certificate.pdf` and `utilisation-certificate.json` (signing
 *   flow): the final PDF, and its number (sequence replaced by NNN), status,
 *   signers, frozen figures as displayed, signature count and CA file name,
 *   which compare across runs; `pdf.sha256` checks the attached file and
 *   differs per run, since each signature is new.
 */

/**
 * Each signer signs in afresh: signing asks for the password again once a
 * sign-in is 10 minutes old, and a fresh one never is during the test. The
 * addresses keep these sign-ins out of the shared localhost rate limit.
 */
const SIGNERS = {
  admin: {
    address: "192.0.2.41",
    email: process.env.ADMIN_EMAIL ?? "",
    password: process.env.ADMIN_PASSWORD ?? "",
    trustee: "jointManagingTrustee",
  },
  super_admin: {
    address: "192.0.2.42",
    email: process.env.SUPER_ADMIN_EMAIL ?? "",
    password: process.env.SUPER_ADMIN_PASSWORD ?? "",
    trustee: "managingTrustee",
  },
} as const;

/** India's day as yyyy-MM-dd. */
const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date()
  );

/**
 * Picks a day in a date field. Never presses Escape: the picker closes
 * itself, and an Escape during its exit would close the form.
 */
async function pickDay(scope: Locator, label: string, date: Date) {
  const page = scope.page();
  await scope.getByRole("button", { exact: true, name: label }).click();
  const popup = page.getByRole("dialog").last();
  const grid = popup.getByRole("grid").first();
  await expect(grid).toBeVisible();
  const day = popup.locator(
    `button[data-day="${date.toLocaleDateString("en-US")}"]`
  );
  const step = date < new Date() ? /previous month/i : /next month/i;
  for (let month = 0; month < 30 && !(await day.isVisible()); month++) {
    await popup.getByRole("button", { name: step }).click();
  }
  await day.click();
  await expect(grid).toBeHidden();
}

/** Prepares a certificate from the dialog; returns its number and page. */
async function prepare(page: Page, dialog: Locator) {
  await dialog
    .getByRole("button", { exact: true, name: "Prepare certificate" })
    .click();
  const heading = page.getByRole("heading", {
    name: /^Utilisation certificate UC\//,
  });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const number =
    (await heading.textContent())?.replace("Utilisation certificate ", "") ??
    "";
  return { number, url: page.url() };
}

/** A toast that names the certificate refusing the change. */
function refusal(page: Page, number: string) {
  return page
    .locator("[data-sonner-toast]")
    .filter({ hasText: `Utilisation certificate ${number} covers this` });
}

async function asRole<T>(
  browser: Browser,
  role: "admin" | "super_admin",
  run: (page: Page) => Promise<T>
): Promise<T> {
  const signer = SIGNERS[role];
  const context = await browser.newContext();
  try {
    const signIn = await context.request.post("/api/auth/sign-in/email", {
      data: { email: signer.email, password: signer.password },
      headers: { "x-forwarded-for": signer.address },
    });
    expect(signIn.status(), `sign in as ${role}`).toBe(200);
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Opens the certificate as the trustee `name`, sets up their DSC afresh and signs. */
async function signAs(
  browser: Browser,
  role: "admin" | "super_admin",
  url: string,
  signer: TestSigner,
  name: string
) {
  // An earlier run may have enrolled them; revoking makes every run enrol.
  await fixture("revoke-dsc", SIGNERS[role].trustee);
  await asRole(browser, role, async (page) => {
    await page.goto(url);
    await waitForZeroReady(page);
    const panel = page.getByRole("region", { name: "Your signature" });
    const enrolment = await catchHelperLink(page);
    await panel
      .getByRole("button", { name: "Set up your DSC" })
      .click({ timeout: 20_000 });
    const enrolled = await completeHelperJob(page, await enrolment(), signer);
    expect(enrolled.status, enrolled.message).toBe(200);
    const signing = await catchHelperLink(page);
    await panel
      .getByRole("button", { name: "Sign with your DSC" })
      .click({ timeout: 20_000 });
    const signed = await completeHelperJob(page, await signing(), signer);
    expect(signed.status, signed.message).toBe(200);
    // Signed, the panel goes: it's no longer their turn.
    await expect(
      page
        .getByTestId("certificate-signers")
        .getByRole("listitem")
        .filter({ hasText: name })
    ).toContainText("Signed", { timeout: 20_000 });
    await expect(panel).toBeHidden();
  });
}

/** The certificate page's Details values, as displayed. */
async function detailsOf(page: Page) {
  const facts: Record<string, string> = {};
  for (const label of [
    "Brought forward",
    "Interest earned",
    "Received",
    "Spent",
    "Closing unspent",
  ]) {
    facts[label] =
      (await page
        .getByText(label, { exact: true })
        .locator("xpath=following-sibling::*[1]")
        .textContent()) ?? "";
  }
  return facts;
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const file = testInfo.outputPath(name);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  await testInfo.attach(name, { contentType: "application/json", path: file });
}

test.describe("utilisation certificates", () => {
  test("the preview matches the grant's utilisation and names every overlap", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const grant = await newGrant();
    await openGrant(page, grant.grantId);
    // The grant page's figures for the whole grant to date.
    const utilisation = page.getByTestId("grant-utilisation");
    await expect(utilisation).toContainText("Closing unspent₹3,000.00", {
      timeout: 15_000,
    });
    await expect(utilisation).toContainText("Received1 contribution₹3,000.00");

    // The preview for the grant to today shows the same money, plus the
    // interest entered, which enters the chain.
    const dialog = await openPrepare(page);
    await dialog
      .getByRole("textbox", { name: "Interest earned (₹)" })
      .fill("250");
    const preview = dialog.getByTestId("certificate-preview");
    await expect(preview).toContainText("Interest earned₹250.00", {
      timeout: 20_000,
    });
    await expect(preview).toContainText("Unspent brought forward₹0.00");
    await expect(preview).toContainText("Received (1)₹3,000.00");
    await expect(preview).toContainText("Total available₹3,250.00");
    await expect(preview).toContainText("Spent₹0.00");
    await expect(preview).toContainText("Closing unspent₹3,250.00");
    await expect(preview).toContainText(
      "Signed by Asha Rao, Head of the Organisation (Managing Trustee), then Vikram Menon, Chief Finance Officer (Joint Managing Trustee)."
    );
    await expect(preview.getByRole("alert")).toHaveCount(0);
    await attachJson(
      testInfo,
      "certificate-preview.json",
      await preview.getByRole("listitem").allTextContents()
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Two live certificates over the first half: a period across both is
    // refused, naming each.
    const first = await newCertificate(
      grant.grantId,
      "final",
      "2026-04-01",
      "2026-06-30"
    );
    const second = await newCertificate(
      grant.grantId,
      "awaiting_finance",
      "2026-07-01",
      "2026-08-31"
    );
    await openGrant(page, grant.grantId);
    const again = await openPrepare(page);
    // From starts the day after the last live certificate's end.
    await pickDay(again, "1 Sep 2026", new Date(2026, 3, 1));
    await expect(again.getByTestId("certificate-preview")).toContainText(
      `The period overlaps ${first.number} and ${second.number}. Pick a period after them, or discard or cancel them first.`,
      { timeout: 20_000 }
    );
    await expect(
      again.getByRole("button", { exact: true, name: "Prepare certificate" })
    ).toBeDisabled();
  });

  test("a live certificate holds its figures until it is cancelled", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const grant = await newGrant();
    // Signed by the Head of the Organisation, covering the gift of 1 Oct.
    const certificate = await newCertificate(
      grant.grantId,
      "awaiting_finance",
      "2026-04-01",
      todayIso()
    );

    // Unlinking the gift from the grant page.
    await openGrant(page, grant.grantId);
    const unlink = async () => {
      await page
        .getByTestId("grant-contributions")
        .getByRole("button", { name: "Row actions" })
        .click();
      await page.getByRole("menuitem", { name: "Unlink from grant" }).click();
    };
    await unlink();
    await expect(refusal(page, certificate.number)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("grant-contributions")).toContainText(
      grant.reference
    );

    // Ending the grant before the certificate's end.
    await page.getByRole("button", { name: "Edit grant" }).click();
    const form = page.getByRole("dialog", { name: "Edit grant" });
    await pickDay(form, "Ends on", new Date(2026, 9, 15));
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(refusal(page, certificate.number)).toBeVisible({
      timeout: 15_000,
    });
    await form.getByRole("button", { name: "Cancel" }).click();

    // Changing the gift's amount, or deleting it, on the Income page.
    await page.goto("/income");
    await waitForZeroReady(page);
    await page
      .getByPlaceholder("Search donor or reference...")
      .fill(grant.reference);
    const row = page.getByRole("row").filter({ hasText: grant.grantor });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    const list = new ListPage(page);
    await list.openRowActionAndClick(row, "Edit");
    const edit = page.getByRole("dialog", { name: "Edit contribution" });
    const amount = edit.getByRole("textbox", { name: "Amount (₹)" });
    await expect(amount).toHaveValue("3000", { timeout: 10_000 });
    await amount.fill("3500");
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(refusal(page, certificate.number)).toBeVisible({
      timeout: 15_000,
    });
    await edit.getByRole("button", { name: "Cancel" }).click();
    await list.openRowActionAndClick(row, "Delete");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete contribution" })
      .click();
    await expect(refusal(page, certificate.number)).toBeVisible({
      timeout: 15_000,
    });
    await expect(row).toHaveCount(1);

    // Cancelled with a reason, the certificate holds nothing.
    await page.goto(`/finance/grants/certificates/${certificate.id}`);
    await waitForZeroReady(page);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Cancel certificate" }).click();
    const cancel = page.getByRole("dialog", { name: "Cancel certificate" });
    await cancel.getByLabel("Reason").fill("Prepared for the wrong period");
    await cancel.getByRole("button", { name: "Cancel certificate" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await openGrant(page, grant.grantId);
    await unlink();
    await expect(
      page.getByText("No contributions are linked yet", { exact: false })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("signers sign in turn, and nobody signs figures that changed", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const grant = await newGrant();
    const waiting = await newCertificate(
      grant.grantId,
      "awaiting_head",
      "2026-04-01",
      "2026-06-30"
    );
    const driftedUnsigned = await newCertificate(
      grant.grantId,
      "awaiting_head",
      "2026-07-01",
      "2026-08-31",
      "drift"
    );
    const driftedSigned = await newCertificate(
      grant.grantId,
      "awaiting_finance",
      "2026-09-01",
      todayIso(),
      "drift"
    );
    const open = async (page: Page, id: string) => {
      await page.goto(`/finance/grants/certificates/${id}`);
      await waitForZeroReady(page);
    };

    // The Chief Finance Officer can't sign before the Head of the Organisation.
    await asRole(browser, "admin", async (page) => {
      await open(page, waiting.id);
      await expect(page.getByText("Waiting for Asha Rao").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByRole("region", { name: "Your signature" })
      ).toHaveCount(0);
    });
    await asRole(browser, "super_admin", async (page) => {
      await open(page, waiting.id);
      await expect(
        page.getByRole("region", { name: "Your signature" })
      ).toBeVisible({ timeout: 20_000 });

      // Drifted before anyone signed: the badge and the panel agree.
      await open(page, driftedUnsigned.id);
      await expect(
        page.getByText("Figures changed since prepared").first()
      ).toBeVisible({ timeout: 20_000 });
      const panel = page.getByRole("region", { name: "Your signature" });
      await expect(panel).toContainText(
        "Figures changed since prepared, so it can't be signed. Finance should discard or cancel it and prepare it again.",
        { timeout: 20_000 }
      );
      await expect(panel.getByRole("button")).toHaveCount(0);
    });
    // Drifted after the first signature.
    await asRole(browser, "admin", async (page) => {
      await open(page, driftedSigned.id);
      await expect(
        page.getByRole("region", { name: "Your signature" })
      ).toContainText("Figures changed since signing, so it can't be signed.", {
        timeout: 20_000,
      });
    });
  });

  test("finance prepares, both trustees sign, the CA's certificate makes it final", async ({
    browser,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "finance_admin", "Finance test");
    test.slow();
    const head = testSigner("asha-rao");
    const finance = testSigner("vikram-menon");
    const grant = await newGrant();

    // A discarded certificate keeps its number: the next one follows it.
    await openGrant(page, grant.grantId);
    const discarded = await prepare(page, await openPrepare(page));
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Discard certificate" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Discard certificate" })
      .click();
    await expect(page.getByText("Discarded", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await openGrant(page, grant.grantId);
    const { number, url } = await prepare(page, await openPrepare(page));
    const sequence = (n: string) => Number(n.split("/").at(-1));
    expect(number.split("/").slice(0, -1)).toEqual(
      discarded.number.split("/").slice(0, -1)
    );
    expect(sequence(number)).toBe(sequence(discarded.number) + 1);
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

    // The CA's UDIN and document, under a name in Hindi.
    await page.getByLabel("UDIN").fill("26123456ABCDEFGHIJ");
    await page.getByLabel("CA's certificate").setInputFiles({
      buffer: Buffer.from("%PDF-1.4\n% E2E CA report\n%%EOF\n"),
      mimeType: "application/pdf",
      name: "सीए रिपोर्ट.pdf",
    });
    await page.getByRole("button", { name: "Record CA certificate" }).click();
    await expect(
      page.getByText("CA certificate recorded. The certificate is final.")
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("UDIN 26123456ABCDEFGHIJ")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByTestId("certificate-steps").locator("[data-state='done']")
    ).toHaveCount(5);
    const id = url.split("/").at(-1) ?? "";
    const ca = await page.request.get(
      `/api/utilisation-certificates/${id}?file=ca`
    );
    expect(ca.status()).toBe(200);
    expect(ca.headers()["content-disposition"]).toBe(
      'attachment; filename="ca-certificate.pdf"'
    );

    // A signer who no longer holds the office they were named for is refused.
    const wrongOffice = await newCertificate(
      (await newGrant()).grantId,
      "awaiting_head",
      "2026-04-01",
      "2026-06-30",
      "wrong-office"
    );
    await asRole(browser, "super_admin", async (other) => {
      await other.goto(`/finance/grants/certificates/${wrongOffice.id}`);
      await waitForZeroReady(other);
      await other
        .getByRole("region", { name: "Your signature" })
        .getByRole("button", { name: "Sign with your DSC" })
        .click({ timeout: 20_000 });
      await expect(
        other.locator("[data-sonner-toast]").filter({
          hasText:
            "Asha Rao no longer holds the office of Treasurer, so they can't sign this certificate.",
        })
      ).toBeVisible({ timeout: 20_000 });
    });

    // The artifact: the final PDF and what it certifies.
    await page.reload();
    await waitForZeroReady(page);
    await expect(
      page.getByText("Final", { exact: true }).first()
    ).toBeVisible();
    const pdf = Buffer.from(
      await (
        await page.request.get(
          `/api/utilisation-certificates/${id}?file=latest`
        )
      ).body()
    );
    const pdfFile = testInfo.outputPath("utilisation-certificate.pdf");
    await writeFile(pdfFile, pdf);
    await testInfo.attach("utilisation-certificate.pdf", {
      contentType: "application/pdf",
      path: pdfFile,
    });
    const signatures = pdf.toString("latin1").match(/\/ByteRange/g)?.length;
    expect(signatures).toBe(2);
    await attachJson(testInfo, "utilisation-certificate.json", {
      ca: { file: "ca-certificate.pdf", udin: "26123456ABCDEFGHIJ" },
      certificate: {
        figures: await detailsOf(page),
        number: number.replace(/\d+$/, "NNN"),
        signers: await page
          .getByTestId("certificate-signers")
          .getByRole("listitem")
          .locator("span.font-medium")
          .allTextContents(),
        status: "Final",
      },
      pdf: {
        sha256: createHash("sha256").update(pdf).digest("hex"),
        signatures,
      },
    });
  });

  test("a volunteer who doesn't sign a certificate can't open or download it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "volunteer", "Volunteer test");
    const grant = await newGrant();
    const certificate = await newCertificate(
      grant.grantId,
      "awaiting_head",
      "2026-04-01",
      "2026-06-30"
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
