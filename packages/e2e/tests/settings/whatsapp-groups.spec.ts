import { expect, test } from "../../fixtures/test";
import { openSettingsPage } from "../../helpers/settings";
import { ListPage } from "../../pages/list-page";

function openWhatsAppGroups(page: import("@playwright/test").Page) {
  return openSettingsPage(page, "/settings/whatsapp-groups", "WhatsApp groups");
}

// Only admin can access WhatsApp Groups, so volunteer project ignores this via testIgnore
test.describe("WhatsApp Groups (admin)", () => {
  test("can add group from picker, edit, and delete", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== "super_admin") {
      test.skip();
    }
    test.slow();

    const settingsDialog = await openWhatsAppGroups(page);

    // fake-gowa.ts lists one new group each time the picker opens.
    await settingsDialog.getByRole("button", { name: "Add group" }).click();
    const pickerDialog = page.getByRole("dialog").filter({
      hasText: "Add WhatsApp Groups",
    });
    await expect(pickerDialog.getByPlaceholder("Search groups...")).toBeVisible(
      { timeout: 15_000 }
    );

    // Select the first available group
    const firstGroupBtn = pickerDialog
      .locator("button")
      .filter({ has: page.locator("[role='checkbox']") })
      .first();
    await expect(firstGroupBtn).toBeVisible();
    const groupName = await firstGroupBtn
      .locator(".font-medium.text-sm")
      .textContent();
    await firstGroupBtn.click();

    // Add selected
    await pickerDialog.getByRole("button", { name: /Add selected/ }).click();

    // Verify group appears in the settings list
    await expect(settingsDialog.getByText(groupName!)).toBeVisible({
      timeout: 10_000,
    });

    // Edit
    const groupRow = settingsDialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: groupName! });
    await new ListPage(page).openRowActionAndClick(groupRow, "Edit");
    await expect(
      settingsDialog.getByText("Edit group", { exact: true })
    ).toBeVisible();

    const updatedName = `${groupName} Updated`;
    await expect(settingsDialog.getByLabel("Name")).toHaveValue(groupName!, {
      timeout: 10_000,
    });
    await expect(async () => {
      await settingsDialog.getByLabel("Name").fill(updatedName);
    }).toPass({ timeout: 15_000 });
    await settingsDialog
      .getByRole("button", { name: "Save" })
      .click({ timeout: 10_000 });

    await expect(settingsDialog.getByText(updatedName)).toBeVisible({
      timeout: 10_000,
    });

    // Delete
    const updatedRow = settingsDialog
      .locator("[data-slot='settings-list-item']")
      .filter({ hasText: updatedName });
    await new ListPage(page).openRowActionAndClick(updatedRow, "Delete");

    const alertDialog = page.getByRole("alertdialog");
    await expect(alertDialog.getByText("Delete group?")).toBeVisible();
    await alertDialog.getByRole("button", { name: "Delete" }).click();

    await expect(settingsDialog.getByText(updatedName)).toBeHidden({
      timeout: 10_000,
    });
  });
});
