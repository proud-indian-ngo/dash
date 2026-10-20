import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test";

/**
 * Circulars against the seeded board: the super admin is the Managing
 * Trustee (Asha Rao) and the admin the Joint Managing Trustee (Vikram
 * Menon), the two trustees in office. Each test drafts its own
 * resolutions. Signing needs the signing service, which E2E doesn't run;
 * the pass rules with signatures are covered by unit and database tests.
 */

async function draft(page: Page, title: string) {
  await page.goto("/governance/resolutions");
  await page.getByRole("button", { name: "New circular" }).click();
  const dialog = page.getByRole("dialog", { name: "New circular" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog
    .getByRole("textbox", { name: "Text" })
    .fill("RESOLVED THAT the Board approves the end-to-end test.");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  // The first save in a fresh stack waits for Zero's initial sync.
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 20_000,
  });
}

/** Issues the open draft, with any other drafts named, in that order. */
async function issue(page: Page, alsoTitles: string[] = []) {
  await page.getByRole("button", { exact: true, name: "Issue" }).click();
  const dialog = page.getByRole("dialog", { name: "Issue a circular" });
  for (const title of alsoTitles) {
    await dialog.getByRole("checkbox", { name: title }).check();
  }
  await dialog
    .getByRole("button", { name: /^Issue (\d+ resolutions )?to the trustees$/ })
    .click();
  await expect(page.getByRole("heading", { name: /^Circular C-/ })).toBeVisible(
    { timeout: 20_000 }
  );
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

function resolutionCard(page: Page, title: string) {
  return page.getByRole("region", { name: title });
}

test.describe("circular resolutions (Managing Trustee)", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
    test.skip(
      Boolean(process.env.CI) &&
        testInfo.title !== "records a past resolution so the series continues",
      "Issuing stores the circular's PDF in R2, which CI does not have"
    );
  });

  test("an objection from one of two trustees fails the resolution", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular objected ${Date.now()}`;
    await draft(page, title);
    await issue(page);
    const card = resolutionCard(page, title);
    await expect(card).toContainText("0 of 2 signatures");
    const panel = page.getByRole("region", { name: "Your signature" });
    await expect(panel).toContainText("Signing assents to resolution 1");
    // Folded behind the DSC button when the signing helper is available.
    const otherWays = panel.getByRole("button", { name: "Other ways to sign" });
    if (await otherWays.isVisible()) {
      await otherWays.click();
    }
    await expect(
      panel.getByRole("button", { name: "Download your copy" })
    ).toBeVisible();

    await card.getByRole("button", { name: "Object to resolution 1" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Object to this resolution",
    });
    await dialog.getByLabel("Reason").fill("The budget isn't approved yet.");
    await dialog.getByRole("button", { name: "Record objection" }).click();
    await confirmIfAsked(page);
    await expect(card.getByText("Failed", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card).toContainText("1 objection left too few trustees");
    await expect(card).toContainText("You objected");
    // Nothing is left to assent to, so there's nothing to sign.
    await expect(panel).toBeHidden();
  });

  test("one circular carries two resolutions, answered one by one", async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const first = `E2E first of two ${stamp}`;
    const second = `E2E second of two ${stamp}`;
    await draft(page, first);
    await draft(page, second);
    await issue(page, [first]);
    // The draft the dialog opened from comes first, the one added after it.
    await expect(
      page.getByRole("heading", { level: 2 }).filter({ hasText: /E2E/ })
    ).toHaveText([second, first]);
    const panel = page.getByRole("region", { name: "Your signature" });
    await expect(panel).toContainText("Signing assents to resolutions 1, 2");

    await resolutionCard(page, first)
      .getByRole("button", { name: "Object to resolution 2" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Object to this resolution",
    });
    await dialog.getByLabel("Reason").fill("Not this one.");
    await dialog.getByRole("button", { name: "Record objection" }).click();
    await confirmIfAsked(page);
    await expect(panel).toContainText(
      "Signing assents to resolution 1 and records that you object to resolution 2",
      { timeout: 15_000 }
    );
    // The first resolution is still open; the second failed on its own.
    await expect(
      resolutionCard(page, second).getByText("Issued", { exact: true })
    ).toBeVisible();
    await expect(
      resolutionCard(page, first).getByText("Failed", { exact: true })
    ).toBeVisible();
  });

  test("a conflicted trustee steps aside, and the issuer can withdraw", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E circular withdrawn ${Date.now()}`;
    await draft(page, title);
    await issue(page);
    const card = resolutionCard(page, title);
    await card
      .getByRole("button", {
        name: "Declare a conflict of interest on resolution 1",
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Declare a conflict of interest",
    });
    await dialog.getByLabel("What is the interest?").fill("Related party.");
    await dialog.getByRole("button", { name: "Declare conflict" }).click();
    await confirmIfAsked(page);
    await expect(card).toContainText("You declared a conflict of interest", {
      timeout: 15_000,
    });
    await expect(card).toContainText("0 of 1 signatures");
    await expect(
      page.getByRole("region", { name: "Your signature" })
    ).toBeHidden();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Withdraw circular" }).click();
    const withdraw = page.getByRole("dialog", {
      name: "Withdraw this circular",
    });
    await withdraw.getByLabel("Reason").fill("Wrong wording.");
    await withdraw.getByRole("button", { name: "Withdraw" }).click();
    await expect(card.getByText("Withdrawn", { exact: true })).toBeVisible({
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
    await expect(dialog).toBeHidden();
    // Earlier runs' circulars sort first, so find the row by its number.
    await page.getByPlaceholder("Search resolutions...").fill(number);
    await expect(
      page.getByRole("row").filter({ hasText: number }).first()
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
    await page
      .getByRole("dialog", { name: "Issue a circular" })
      .getByRole("button", { name: "Issue to the trustees" })
      .click();
    await expect(
      page.getByText(/Only the Managing Trustee can issue/)
    ).toBeVisible();
  });
});
