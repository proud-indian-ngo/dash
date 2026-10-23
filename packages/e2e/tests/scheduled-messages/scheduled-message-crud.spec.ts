import { addHours, addMonths, format, setDate } from "date-fns";

import { expect, test } from "../../fixtures/test";
import { ListPage } from "../../pages/list-page";

test.describe("Scheduled messages (admin)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "super_admin", "Admin-only test");

    await page.goto("/scheduled-messages");
    await expect(
      page.getByRole("heading", { exact: true, level: 1, name: "Messages" })
    ).toBeVisible();
  });

  test.slow();
  test("creates, views, cancels, and deletes a scheduled message", async ({
    page,
  }) => {
    const messageText = `E2E Message ${Date.now()}`;
    const list = new ListPage(page);

    // -- Create --
    await page.getByRole("button", { name: "Schedule message" }).click();
    const dialog = page.getByRole("dialog", { name: "Schedule message" });
    await expect(dialog).toBeVisible();

    // Fill message
    await dialog.getByRole("textbox", { name: "Message" }).fill(messageText);

    // Select recipient — open popover and pick the seeded group
    await dialog.getByRole("button", { name: "Add recipients..." }).click();
    // Wait for the command list to appear and select the test group
    await page.getByRole("option", { name: /E2E Test Group/ }).click();
    // Close the popover by clicking outside or pressing Escape
    await page.keyboard.press("Escape");

    await test.step("a day pick survives a re-render mid-click", async () => {
      const scheduledAt = dialog.getByLabel("Scheduled at");
      const defaultHour = addHours(new Date(), 1).getHours() % 12 || 12;
      const hour = defaultHour === 11 ? "10" : "11";
      const nextMonth = addMonths(new Date(), 1);
      const dayButton = (day: number) =>
        page.getByRole("button", {
          name: new RegExp(format(setDate(nextMonth, day), "MMMM do, yyyy")),
        });
      await scheduledAt.click();
      await page.getByRole("button", { name: "Go to the Next Month" }).click();
      await dayButton(15).click();
      await expect(scheduledAt).toHaveText(
        new RegExp(`^15 ${format(nextMonth, "MMM yyyy")},`)
      );
      await dayButton(16).hover();
      await page.mouse.down();
      // A form update lands between press and release, as a Zero sync or a
      // validation would; the day button must survive it.
      await page
        .getByRole("button", { exact: true, name: hour })
        .dispatchEvent("click");
      await page.mouse.up();
      await expect(scheduledAt).toHaveText(
        new RegExp(`^16 ${format(nextMonth, "MMM yyyy")}, ${hour}:`)
      );
      await page.keyboard.press("Escape");
    });

    await dialog
      .getByRole("button", { exact: true, name: "Schedule message" })
      .click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Message scheduled")).toBeVisible();
    await expect(page.getByText(messageText)).toBeVisible({ timeout: 10_000 });

    await test.step("the next message starts without the last one's recipients", async () => {
      const nextText = `E2E Message without recipients ${Date.now()}`;
      await page.getByRole("button", { name: "Schedule message" }).click();
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("textbox", { name: "Message" })
      ).toHaveValue("");
      await expect(dialog.getByText("0/10 recipients selected")).toBeVisible();
      await dialog.getByRole("textbox", { name: "Message" }).fill(nextText);
      // With no recipient the form can't be saved.
      await expect(
        dialog.getByRole("button", { exact: true, name: "Schedule message" })
      ).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      await page.reload();
      await expect(page.getByText(messageText)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(nextText)).toHaveCount(0);
    });

    // -- View details via row action --
    const row = page.getByRole("row").filter({ hasText: messageText });
    await list.openRowActionAndClick(row, "View details");

    // Sheet should show message content and recipients
    const sheet = page.getByRole("dialog", { name: "Scheduled Message" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(messageText)).toBeVisible();
    await expect(sheet.getByText("E2E Test Group")).toBeVisible();
    await expect(
      sheet.getByRole("heading", { name: /^Recipients/ })
    ).toBeVisible();

    // -- Cancel from the sheet header's ⋯ menu --
    await sheet.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Cancel message" }).click();
    const cancelDialog = page.getByRole("alertdialog");
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "Cancel message" }).click();
    await expect(cancelDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Message cancelled")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // -- Delete (only available after cancel) --
    const cancelledRow = page.getByRole("row").filter({ hasText: messageText });
    await list.openRowActionAndClick(cancelledRow, "Delete");

    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(deleteDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText("Message deleted")).toBeVisible();
  });
});
