import { expect, test, waitForZeroReady } from "../../fixtures/test";

test.describe("Create user unhappy paths (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "admin", "Admin-only test");

    await page.goto("/users");
    await waitForZeroReady(page);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("duplicate email is rejected when creating a user", async ({
    page,
    volunteerEmail,
  }) => {
    // Open create user dialog
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /Add User|Create User/i })
    ).toBeVisible();

    // Fill in the volunteer's existing email
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Duplicate User");
    await dialog.getByRole("textbox", { name: "Email" }).fill(volunteerEmail);
    await dialog
      .getByRole("textbox", { name: "Password" })
      .fill("Password123!");
    await dialog.getByRole("combobox", { name: "Role" }).click();
    await page
      .getByRole("option", { name: /volunteer/i })
      .first()
      .click();

    // Submit
    await dialog
      .getByRole("button", { name: /Create|Add/i })
      .first()
      .click();

    // Expect an error — either a toast or inline error about duplicate email
    await expect(
      page
        .getByText(/email.*already.*exist|already.*taken|duplicate.*email/i)
        .or(page.getByText(/Failed to create user/i))
        .or(dialog.locator("[aria-invalid='true']").first())
    ).toBeVisible({ timeout: 10_000 });
  });
});
