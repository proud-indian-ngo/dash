import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * Circular resolutions against the seeded board: the super admin is the
 * Managing Trustee (Asha Rao) and the admin the Joint Managing Trustee
 * (Vikram Menon), the two trustees in office. Each test drafts its own
 * circular. Signing needs the signing service, which E2E doesn't run; the
 * pass rules with signatures are covered by unit and database tests.
 */

async function draftAndIssue(page: Page, title: string) {
  await page.goto("/governance/resolutions");
  await page.getByRole("button", { name: "New circular" }).click();
  const dialog = page.getByRole("dialog", { name: "New circular" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog
    .getByRole("textbox", { name: "Text" })
    .fill("RESOLVED THAT the Board approves the end-to-end test.");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Issue" }).click();
  await page.getByRole("button", { name: "Issue to the trustees" }).click();
  await expect(page.getByText("Issued", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("0 of 2 signatures")).toBeVisible();
}

/** Voting asks for the password when the sign-in is older than 10 minutes. */
async function confirmIfAsked(page: Page) {
  const reauth = page.getByRole("dialog", { name: "Confirm it's you" });
  await reauth
    .waitFor({ state: "visible", timeout: 5000 })
    .then(async () => {
      await reauth
        .getByLabel("Password")
        .fill(process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!");
      await reauth.getByRole("button", { name: "Continue" }).click();
    })
    .catch(() => undefined);
}

test.describe("circular resolutions (Managing Trustee)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("an objection from one of two trustees fails the circular", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular objected ${Date.now()}`;
    await draftAndIssue(page, title);
    const panel = page.getByRole("region", { name: "Your response" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Download PDF" })
    ).toHaveAttribute("href", /kind=resolutionPdf/);

    await panel.getByRole("button", { exact: true, name: "Object" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Object to this resolution",
    });
    await dialog.getByLabel("Reason").fill("The budget isn't approved yet.");
    await dialog.getByRole("button", { name: "Record objection" }).click();
    await confirmIfAsked(page);
    await expect(page.getByText("Failed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/1 objection left too few trustees/)
    ).toBeVisible();
    const row = page.getByRole("row", { name: /Asha Rao/ });
    await expect(row).toContainText("Objected");
    await expect(row).toContainText("The budget isn't approved yet.");
  });

  test("a conflicted trustee steps aside, and the issuer can withdraw", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular withdrawn ${Date.now()}`;
    await draftAndIssue(page, title);
    const panel = page.getByRole("region", { name: "Your response" });
    await panel
      .getByRole("button", { name: "Declare a conflict of interest" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Declare a conflict of interest",
    });
    await dialog.getByLabel("What is the interest?").fill("Related party.");
    await dialog.getByRole("button", { name: "Declare conflict" }).click();
    await confirmIfAsked(page);
    await expect(panel).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByRole("row", { name: /Asha Rao/ }).getByText("Conflict declared")
    ).toBeVisible();
    await expect(page.getByText("0 of 1 signatures")).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Withdraw circular" }).click();
    const withdraw = page.getByRole("dialog", {
      name: "Withdraw this circular",
    });
    await withdraw.getByLabel("Reason").fill("Wrong wording.");
    await withdraw.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("records a past resolution so the series continues", async ({
    page,
  }) => {
    await page.goto("/governance/resolutions");
    await page.getByRole("button", { name: "More actions" }).click();
    await page
      .getByRole("menuitem", { name: "Record a past resolution" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Record a past resolution",
    });
    const number = `PI/TR/2019-20/${String(Date.now()).slice(-3)}`;
    await dialog.getByRole("textbox", { name: "Number" }).fill(number);
    await dialog
      .getByRole("textbox", { name: "Title" })
      .fill("Opening of the bank account");
    await dialog
      .getByRole("button", { exact: true, name: "Passed on" })
      .click();
    await page
      .getByRole("dialog")
      .last()
      .locator("button[data-day]")
      .first()
      .click();
    await dialog.getByRole("button", { name: "Record resolution" }).click();
    await expect(page.getByText("Resolution recorded")).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(number) })
    ).toContainText("recorded from paper");
  });
});

test.describe("circular resolutions (another trustee)", () => {
  test("the Joint Managing Trustee can't issue", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin test");
    await page.goto("/governance/resolutions");
    const title = `E2E circular by JMT ${Date.now()}`;
    await page.getByRole("button", { name: "New circular" }).click();
    const dialog = page.getByRole("dialog", { name: "New circular" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Issue" }).click();
    await page.getByRole("button", { name: "Issue to the trustees" }).click();
    await expect(
      page.getByText(/Only the Managing Trustee can issue/)
    ).toBeVisible();
  });
});
