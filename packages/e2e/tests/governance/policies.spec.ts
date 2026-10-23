import { expect, test } from "../../fixtures/test";

/**
 * Editing and deleting a policy that has no version yet, so nobody is asked
 * to accept anything. Publishing is covered by policy-gate.spec.ts.
 */

test.describe("policy register", () => {
  test.beforeEach(({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Super-admin test");
  });

  test("edits a policy before its first version and deletes it", async ({
    page,
  }) => {
    const title = `E2E draft policy ${Date.now()}`;
    await page.goto("/governance/policies");
    await page.getByRole("button", { name: "New policy" }).click();
    const create = page.getByRole("dialog", { name: "New policy" });
    await create.getByRole("textbox", { name: "Title" }).fill(title);
    await create.getByRole("button", { name: "Add policy" }).click();
    await expect(create).toBeHidden();

    const renamed = `${title} (renamed)`;
    await page
      .getByRole("region", { name: title })
      .getByRole("button", { name: "More actions" })
      .click();
    await page.getByRole("menuitem", { exact: true, name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit policy" });
    await edit.getByRole("textbox", { name: "Title" }).fill(renamed);
    await edit.getByRole("combobox", { name: "For" }).click();
    await page.getByRole("option", { name: "Trustees" }).click();
    await edit.getByRole("button", { exact: true, name: "Save" }).click();
    await expect(edit).toBeHidden();

    const card = page.getByRole("region", { name: renamed });
    await expect(card.getByText("For trustees")).toBeVisible();
    await card.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { exact: true, name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this policy?" })
      .getByRole("button", { name: "Delete policy" })
      .click();
    await expect(card).toBeHidden();
  });
});
