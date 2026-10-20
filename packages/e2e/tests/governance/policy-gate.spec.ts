import path from "node:path";

import { expect, test } from "../../fixtures/test";

/**
 * Accepting policies before using the dashboard. Publishing a version in
 * force holds back everyone it is for until they accept it, so this spec
 * runs in the `exclusive_last` project: after every other project, with one
 * worker. The super admin is Asha Rao, a trustee in office.
 */

test.describe("accepting policies (runs last, alone)", () => {
  test("a trustee accepts a new trustee policy before using the dashboard", async ({
    page,
  }) => {
    test.slow();
    const title = `E2E trustee code ${Date.now()}`;
    await page.goto("/governance/policies");
    await page.getByRole("button", { name: "New policy" }).click();
    const create = page.getByRole("dialog", { name: "New policy" });
    await create.getByRole("textbox", { name: "Title" }).fill(title);
    await create.getByRole("combobox", { name: "For" }).click();
    await page.getByRole("option", { name: "Trustees" }).click();
    await create.getByRole("button", { name: "Add policy" }).click();
    await expect(create).toBeHidden();

    const card = page.getByRole("region", { name: title });
    await card.getByRole("button", { name: "Publish a version" }).click();
    const publish = page.getByRole("dialog", { name: "Publish a version" });
    await publish.getByRole("combobox", { name: "Approved document" }).click();
    await page
      .getByRole("option", { name: /Volunteer code of conduct/ })
      .click();
    await publish
      .getByLabel("What changed", { exact: true })
      .fill("First version");
    await publish.getByRole("button", { name: "Publish version" }).click();

    // Zero sends them to the accept page as soon as the version is in force.
    await expect(page).toHaveURL(/\/accept-policies\?/, { timeout: 20_000 });
    // A page load is sent there by the layout's guard.
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/accept-policies\?redirect=%2Fteams/);
    await expect(
      page.getByRole("heading", { name: "Before you continue" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      /kind=policyDocument/
    );

    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "I have read and accept these policies" })
      .check();
    await continueButton.click();

    await expect(page).toHaveURL(/\/teams$/, { timeout: 20_000 });
    await page.goto("/governance/policies");
    await expect(
      page
        .getByRole("region", { name: title })
        .getByText(/^1 of \d+ acknowledged$/)
    ).toBeVisible();
  });

  test.describe("with nothing to accept", () => {
    test.use({
      storageState: path.resolve(
        import.meta.dirname,
        "../../.auth/volunteer.json"
      ),
    });

    test("a volunteer goes straight to the dashboard", async ({ page }) => {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Dashboard" })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    });
  });
});
