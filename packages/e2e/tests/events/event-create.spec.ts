import { expect, test } from "../../fixtures/test";
import { SANDBOX_TEAM, openSeededTeam } from "../../helpers/team-event";

test.describe("Create event (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await openSeededTeam(page, SANDBOX_TEAM);
  });

  test("Create with an empty name shows the name error", async ({ page }) => {
    await page.getByRole("button", { name: "Create event" }).click();
    const dialog = page.getByRole("dialog");

    await expect(
      dialog.getByRole("textbox", { exact: true, name: "Name" })
    ).toHaveValue("");
    await dialog
      .getByRole("button", { exact: true, name: "Create event" })
      .click();
    await expect(dialog.getByText("Name is required")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("mobile drawer keeps its form actions in view", async ({ page }) => {
    await page.setViewportSize({ height: 932, width: 430 });

    await page.getByRole("button", { name: "Create event" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const createButton = dialog.getByRole("button", {
      exact: true,
      name: "Create event",
    });

    // The actions are pinned while the fields scroll under them.
    await expect(createButton).toBeInViewport();
    await dialog.hover();
    await page.mouse.wheel(0, 1600);
    await expect(createButton).toBeInViewport();
  });
});
